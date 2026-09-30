//! Deterministic daily quest planning and event-driven progress.
use serde_json::{json, Value};
use std::sync::OnceLock;
fn defs() -> &'static Vec<Value> {
    static DEFS: OnceLock<Vec<Value>> = OnceLock::new();
    DEFS.get_or_init(|| serde_json::from_str(include_str!("quests.json")).unwrap())
}
fn num(v: &Value) -> f64 {
    v.as_f64().unwrap_or(0.0)
}
fn yes(v: &Value) -> bool {
    v.as_bool().unwrap_or(false)
}
fn arr(v: &Value) -> &[Value] {
    v.as_array().map(Vec::as_slice).unwrap_or(&[])
}
fn def(id: &str) -> Option<&'static Value> {
    defs().iter().find(|d| d["id"] == id)
}
fn plays(id: &str, c: &Value) -> f64 {
    match id {
        "first5" => (5.0 / (num(&c["count"]) * 0.7)).ceil(),
        "combo20" | "play2" => 2.0,
        "learn10" => (10.0 / (num(&c["count"]) * 0.6)).ceil(),
        _ => 1.0,
    }
}
fn eligible(id: &str, c: &Value) -> bool {
    match id {
        "review1" => num(&c["review"]) > 0.0,
        "new1" => yes(&c["hasNew"]),
        "extra" | "extra5" => yes(&c["extraOk"]),
        "combo20" => num(&c["count"]) * num(&c["avgCells"]) >= 26.0,
        "learn10" => yes(&c["hasLearning"]) && yes(&c["placed"]),
        _ => true,
    }
}
fn play_minutes(count: f64, extra: bool) -> f64 {
    (count * 18.0 + if extra { 90.0 } else { 0.0 } + 30.0) / 60.0
}
fn minutes(list: &[Value], ctx: &Value) -> f64 {
    let pm = play_minutes(num(&ctx["count"]), yes(&ctx["extraOk"]));
    let (mut any, mut review, mut grade, mut practice) = (0.0_f64, 0.0_f64, 0.0_f64, 0.0_f64);
    for q in list {
        let id = q["id"].as_str().unwrap_or("");
        let Some(d) = def(id) else { continue };
        let n = plays(id, ctx);
        match d["mode"].as_str().unwrap() {
            "any" => any = any.max(n),
            "review" => review = review.max(n),
            "grade" => grade = grade.max(n),
            "practice" => practice = practice.max(n),
            _ => (),
        }
    }
    review * (num(&ctx["review"]).clamp(1.0, 10.0) * 18.0 + 30.0) / 60.0
        + (grade + practice) * pm
        + (any - grade - practice).max(0.0) * pm
}
struct Rng(u32);
impl Rng {
    fn next(&mut self) -> f64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 17;
        self.0 ^= self.0 << 5;
        f64::from(self.0 % 1_000_000) / 1_000_000.0
    }
    fn shuffle(&mut self, list: &mut [Value]) {
        for i in (1..list.len()).rev() {
            let j = (self.next() * (i + 1) as f64).floor() as usize;
            list.swap(i, j)
        }
    }
}
fn daily(day: &str, ctx: &Value) -> Value {
    let mut h = 2166136261_u32;
    for ch in day.encode_utf16() {
        h ^= u32::from(ch);
        h = h.wrapping_mul(16777619)
    }
    let mut rng = Rng(if h == 0 { 1 } else { h });
    let chance = rng.next();
    let polish = !arr(&ctx["rusty"]).is_empty() && num(&ctx["polishWeek"]) < 2.0 && chance < 0.5;
    let avail = defs()
        .iter()
        .filter(|d| d["id"] != "polish" && eligible(d["id"].as_str().unwrap(), ctx));
    let (mut easy, mut hard): (Vec<Value>, Vec<Value>) =
        avail.cloned().partition(|d| d["tier"] == "easy");
    rng.shuffle(&mut easy);
    rng.shuffle(&mut hard);
    if polish {
        let mut d = def("polish").unwrap().clone();
        d["skill"] = ctx["rusty"][0].clone();
        hard.insert(0, d)
    }
    for h in hard {
        for i in 0..easy.len() {
            for j in i + 1..easy.len() {
                let list = [easy[i].clone(), easy[j].clone(), h.clone()];
                if list[0]["metric"] == list[1]["metric"]
                    || list[0]["metric"] == list[2]["metric"]
                    || list[1]["metric"] == list[2]["metric"]
                {
                    continue;
                }
                if minutes(&list, ctx) <= 15.0 {
                    return Value::Array(
                        list.iter()
                            .map(|q| {
                                let mut v =
                                    json!({"id":q["id"],"goal":q["goal"],"prog":0,"done":false});
                                if q.get("skill").is_some() {
                                    v["skill"] = q["skill"].clone()
                                }
                                v
                            })
                            .collect(),
                    );
                }
            }
        }
    }
    json!([{"id":"play1","goal":1,"prog":0,"done":false},{"id":"combo5","goal":5,"prog":0,"done":false},{"id":"play2","goal":2,"prog":0,"done":false}])
}
fn all_done(state: &Value) -> bool {
    let list = arr(&state["list"]);
    !list.is_empty() && list.iter().all(|q| yes(&q["done"]))
}
fn event(state: &mut Value, ev: &Value) -> Value {
    let mut done = vec![];
    if let Some(list) = state["list"].as_array_mut() {
        for q in list {
            if yes(&q["done"]) {
                continue;
            }
            let Some(d) = q["id"].as_str().and_then(def) else {
                continue;
            };
            let before = num(&q["prog"]);
            let mut value = before;
            let solve = ev["type"] == "solve";
            let add = match d["metric"].as_str().unwrap() {
                "play" => ev["type"] == "play",
                "gradePlay" => ev["type"] == "play" && ev["mode"] == "grade",
                "combo" => {
                    if ev["type"] == "combo" {
                        value = value.max(num(&ev["value"]).min(num(&q["goal"])))
                    }
                    false
                }
                "firstTry" => solve && yes(&ev["firstTry"]),
                "review" => solve && yes(&ev["review"]),
                "newSkill" => solve && ev["skillState"] == "new",
                "learning" => {
                    solve && (ev["skillState"] == "new" || ev["skillState"] == "learning")
                }
                "extraReach" => ev["type"] == "extra",
                "extraSolved" => solve && yes(&ev["extra"]),
                "skill" => solve && yes(&ev["firstTry"]) && ev["skill"] == q["skill"],
                _ => false,
            };
            if add {
                value += 1.0
            }
            value = value.min(num(&q["goal"]));
            q["prog"] = json!(value as u64);
            if value >= num(&q["goal"]) && before < num(&q["goal"]) {
                q["done"] = json!(true);
                done.push(q.clone())
            }
        }
    }
    json!(done)
}
pub fn dispatch(op: &str, a: &Value) -> Option<Value> {
    Some(match op {
        "dailyQuests" => daily(a["day"].as_str().unwrap_or(""), &a["ctx"]),
        "questMinutes" => json!(minutes(arr(&a["list"]), &a["ctx"])),
        "playMinutes" => json!(play_minutes(num(&a["count"]), yes(&a["withExtra"]))),
        "questPlays" => json!(plays(a["id"].as_str().unwrap_or(""), &a["ctx"])),
        "questEligible" => json!(eligible(a["id"].as_str().unwrap_or(""), &a["ctx"])),
        "allDone" => json!(all_done(&a["state"])),
        "questEvent" => {
            let mut state = a["state"].clone();
            let result = event(&mut state, &a["event"]);
            json!({"state":state,"result":result})
        }
        "ensureDay" => {
            let mut state = a["state"].clone();
            let mut result = false;
            if state["day"] != a["day"] || !state["list"].is_array() {
                state["day"] = a["day"].clone();
                state["list"] = daily(a["day"].as_str().unwrap_or(""), &a["ctx"]);
                if arr(&state["list"]).iter().any(|q| q["id"] == "polish") {
                    let mut days = arr(&state["polishDays"]).to_vec();
                    days.push(a["day"].clone());
                    if days.len() > 14 {
                        days.drain(..days.len() - 14);
                    }
                    state["polishDays"] = json!(days)
                }
                state["rewarded"] = json!(false);
                if !state["doneDays"].is_object() {
                    state["doneDays"] = json!({})
                }
                result = true
            }
            json!({"state":state,"result":result})
        }
        "claimReward" => {
            let mut state = a["state"].clone();
            let result = all_done(&state) && !yes(&state["rewarded"]);
            if result {
                state["rewarded"] = json!(true);
                if !state["doneDays"].is_object() {
                    state["doneDays"] = json!({})
                }
                let day = state["day"].as_str().unwrap_or("undefined").to_string();
                state["doneDays"][day] = json!(true)
            }
            json!({"state":state,"result":result})
        }
        _ => return None,
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn repeatable_daily() {
        let ctx = json!({"count":10,"review":3,"hasNew":true,"hasLearning":true,"placed":true,"extraOk":true,"avgCells":2.5});
        let list = daily("2026-09-30", &ctx);
        assert_eq!(list, daily("2026-09-30", &ctx));
        assert_eq!(arr(&list).len(), 3);
        assert!(minutes(arr(&list), &ctx) <= 15.0)
    }
    #[test]
    fn rewards_only_once() {
        let s = json!({"day":"2026-09-30","list":[{"id":"play1","goal":1,"prog":0,"done":false}]});
        let out = dispatch("questEvent", &json!({"state":s,"event":{"type":"play"}})).unwrap();
        let reward = dispatch("claimReward", &json!({"state":out["state"]})).unwrap();
        assert_eq!(reward["result"], true);
        assert_eq!(
            dispatch("claimReward", &json!({"state":reward["state"]})).unwrap()["result"],
            false
        )
    }
}
