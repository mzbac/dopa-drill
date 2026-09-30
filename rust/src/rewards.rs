//! Trophy accounting and cosmetic eligibility/selection. The host supplies
//! display catalogs, timestamps and random draws; no UI, clock or RNG lives here.
use serde_json::{json, Map, Value};

fn arr(value: &Value) -> &[Value] {
    value.as_array().map(Vec::as_slice).unwrap_or(&[])
}

fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(value) => *value,
        Value::Number(value) => value.as_f64().is_some_and(|n| n != 0.0 && !n.is_nan()),
        Value::String(value) => !value.is_empty(),
        _ => true,
    }
}

fn num(value: &Value) -> f64 {
    match value {
        Value::Number(value) => value.as_f64().unwrap_or(0.0),
        Value::Bool(value) => f64::from(*value),
        Value::String(value) => value.trim().parse().unwrap_or(0.0),
        _ => 0.0,
    }
}

fn numeric(value: f64) -> Value {
    if value.is_finite()
        && value.fract() == 0.0
        && value >= i64::MIN as f64
        && value < i64::MAX as f64
    {
        json!(value as i64)
    } else {
        json!(value)
    }
}

fn or_zero(value: &Value) -> Value {
    if truthy(value) {
        value.clone()
    } else {
        json!(0)
    }
}

fn object(value: &mut Value) -> &mut Map<String, Value> {
    if !value.is_object() {
        *value = json!({});
    }
    value.as_object_mut().unwrap()
}

fn mastered(prog: &Value, id: &str) -> bool {
    truthy(&prog["skills"][id]["mastered"])
}

fn trophy_metrics(snap: &Value) -> Value {
    let stats = &snap["stats"];
    let prog = &snap["prog"];
    let skills = arr(crate::skills());
    let stars = skills
        .iter()
        .map(|skill| {
            let id = skill["id"].as_str().unwrap_or("");
            num(&prog["skills"][id]["stars"]).max(if mastered(prog, id) { 1.0 } else { 0.0 })
        })
        .collect::<Vec<_>>();
    let mut metrics = Map::new();
    for key in ["bestStreak", "stickers", "crowns"] {
        metrics.insert(key.into(), or_zero(&snap[key]));
    }
    for key in [
        "days",
        "problems",
        "cells",
        "plays",
        "extras",
        "extraBest",
        "extraSolved",
        "maxCombo",
        "perfects",
        "firstTry",
        "reviewSolved",
        "polished",
        "capsules",
        "capsuleFaster",
        "grew",
    ] {
        metrics.insert(key.into(), or_zero(&stats[key]));
    }
    metrics.insert(
        "minutes".into(),
        numeric((num(&stats["playMs"]) / 60_000.0).floor()),
    );
    metrics.insert(
        "bestDopaL".into(),
        numeric((num(&stats["bestDopaL"]) + 1e-9).floor()),
    );
    metrics.insert(
        "unlocked".into(),
        json!(skills
            .iter()
            .filter(|skill| {
                arr(&skill["req"])
                    .iter()
                    .all(|id| mastered(prog, id.as_str().unwrap_or("")))
            })
            .count()),
    );
    metrics.insert(
        "mastered".into(),
        json!(skills
            .iter()
            .filter(|skill| { mastered(prog, skill["id"].as_str().unwrap_or("")) })
            .count()),
    );
    metrics.insert("starsTotal".into(), numeric(stars.iter().sum()));
    metrics.insert(
        "star5".into(),
        json!(stars.iter().filter(|&&n| n >= 5.0).count()),
    );
    for grade in 1..=6 {
        metrics.insert(
            format!("gradeStar3{grade}"),
            json!(i32::from(
                skills
                    .iter()
                    .zip(&stars)
                    .filter(|(skill, _)| skill["grade"].as_i64() == Some(grade))
                    .all(|(_, &stars)| stars >= 3.0)
            )),
        );
        metrics.insert(
            format!("gradeDone{grade}"),
            json!(i32::from(
                skills
                    .iter()
                    .filter(|skill| skill["grade"].as_i64() == Some(grade))
                    .all(|skill| mastered(prog, skill["id"].as_str().unwrap_or("")))
            )),
        );
        metrics.insert(
            format!("gradePlays{grade}"),
            or_zero(&stats["grades"][grade.to_string()]),
        );
    }
    // The curriculum's lane indices are contiguous and authoritative.
    let lane_count = skills
        .iter()
        .filter_map(|skill| skill["lane"].as_u64())
        .max()
        .map_or(0, |n| n + 1);
    for lane in 0..lane_count {
        metrics.insert(
            format!("laneDone{lane}"),
            json!(i32::from(
                skills
                    .iter()
                    .filter(|skill| skill["lane"].as_u64() == Some(lane))
                    .all(|skill| mastered(prog, skill["id"].as_str().unwrap_or("")))
            )),
        );
    }
    if let Some(flags) = stats["flags"].as_object() {
        for (key, value) in flags {
            if truthy(value) {
                metrics.insert(format!("flag:{key}"), json!(1));
            }
        }
    }
    metrics.insert(
        "allModes".into(),
        json!(i32::from(
            ["level", "grade", "practice", "review"]
                .iter()
                .all(|key| truthy(&stats["modes"][key]))
        )),
    );
    if let Some(extra) = snap["extra"].as_object() {
        metrics.extend(
            extra
                .iter()
                .map(|(key, value)| (key.clone(), value.clone())),
        );
    }
    Value::Object(metrics)
}

fn value_of(metrics: &Value, metric: &Value) -> Value {
    or_zero(&metrics[metric.as_str().unwrap_or("")])
}

fn evaluate_trophies(args: &Value) -> Value {
    let mut state = args["state"].clone();
    object(&mut state);
    if !truthy(&state["got"]) {
        state["got"] = json!({});
    }
    let mut fresh = vec![];
    for trophy in arr(&args["trophies"]) {
        let id = trophy["id"].as_str().unwrap_or("");
        if truthy(&state["got"][id]) {
            continue;
        }
        if num(&value_of(&args["metrics"], &trophy["metric"])) >= num(&trophy["need"]) {
            object(&mut state["got"]).insert(id.into(), args["at"].clone());
            fresh.push(trophy.clone());
        }
    }
    if !truthy(&state["init"]) {
        state["init"] = json!(true);
        state["batch"] = json!(fresh
            .iter()
            .map(|trophy| trophy["id"].clone())
            .collect::<Vec<_>>());
        fresh.clear();
    }
    json!({"state":state,"result":fresh})
}

fn series_view(args: &Value) -> Value {
    let items = arr(&args["series"]["items"]);
    let got = &args["state"]["got"];
    let earned = |trophy: &&Value| truthy(&got[trophy["id"].as_str().unwrap_or("")]);
    let owned = items.iter().filter(earned).cloned().collect::<Vec<_>>();
    let next = items.iter().find(|trophy| !earned(trophy));
    let mut view = json!({
        "series":args["series"],
        "got":owned,
        "top":owned.last(),
        "value":next.map(|trophy| value_of(&args["metrics"], &trophy["metric"]))
    });
    // JavaScript's undefined `next` disappears at the JSON bridge boundary.
    if let Some(next) = next {
        view["next"] = next.clone();
    }
    view
}

fn item_unlocked(item: &Value, got: &Value) -> bool {
    truthy(item)
        && (truthy(&item["base"])
            || (truthy(&item["trophy"]) && truthy(&got[item["trophy"].as_str().unwrap_or("")])))
}

fn unlocked_in<'a>(items: &'a Value, cat: &Value, got: &Value) -> Vec<&'a Value> {
    arr(items)
        .iter()
        .filter(|item| &item["cat"] == cat && item_unlocked(item, got))
        .collect()
}

fn category_key(category: &Value) -> &str {
    category
        .as_str()
        .or_else(|| category["key"].as_str())
        .unwrap_or("")
}

fn pick_look(args: &Value) -> Value {
    let mut look = Map::new();
    let mut consumed = 0;
    for category in arr(&args["cats"]) {
        let key = category_key(category);
        let want = &args["equip"][key];
        let own = unlocked_in(&args["items"], &json!(key), &args["got"]);
        if truthy(want) && want != "auto" && own.iter().any(|item| &item["id"] == want) {
            look.insert(key.into(), want.clone());
        } else {
            let random = num(&args["random"][consumed]);
            consumed += 1;
            let index = (random * own.len() as f64).floor() as usize;
            // Valid catalogs contain a base item per category and draws are in
            // [0,1), as with Math.random. A malformed request fails gracefully.
            if let Some(item) = own.get(index) {
                look.insert(key.into(), item["id"].clone());
            }
        }
    }
    json!({"result":look,"consumed":consumed})
}

fn collection_metrics(args: &Value) -> Value {
    let got = &args["got"];
    let items = arr(&args["items"]);
    json!({
        "itemsOwned":items.iter().filter(|item| item_unlocked(item, got)).count(),
        "catComplete":arr(&args["cats"]).iter().filter(|category| {
            let key = category_key(category);
            items.iter().filter(|item| item["cat"].as_str() == Some(key))
                .all(|item| item_unlocked(item, got))
        }).count()
    })
}

fn trophy_extra_metrics(args: &Value) -> Value {
    let mut days = args["doneDays"]
        .as_object()
        .map(|days| days.keys().collect::<Vec<_>>())
        .unwrap_or_default();
    days.sort();
    let mut run = 0;
    let mut best = 0;
    let mut previous: Option<&str> = None;
    for day in &days {
        let consecutive = previous.is_some_and(|previous| {
            !previous.is_empty()
                && crate::progress::dispatch("daysBetween", &json!({"a":previous,"b":day}))
                    == Some(json!(1))
        });
        run = if consecutive { run + 1 } else { 1 };
        best = best.max(run);
        previous = Some(day.as_str());
    }
    let mut metrics = collection_metrics(args);
    metrics["questDays"] = json!(days.len());
    metrics["questRun"] = json!(best);
    metrics["hammerUsed"] = or_zero(&args["hammerUsed"]);
    metrics
}

fn count_crowns(stickers: &Value) -> usize {
    match stickers {
        Value::Object(stickers) => stickers.values().filter(|value| *value == "crown").count(),
        Value::Array(stickers) => stickers.iter().filter(|value| *value == "crown").count(),
        _ => 0,
    }
}

pub fn dispatch(op: &str, args: &Value) -> Option<Value> {
    Some(match op {
        "trophyMetrics" => trophy_metrics(&args["snap"]),
        "evaluateTrophies" => evaluate_trophies(args),
        "trophyValueOf" => value_of(&args["metrics"], &args["metric"]),
        "earnedCount" => json!(arr(&args["trophies"])
            .iter()
            .filter(|trophy| { truthy(&args["state"]["got"][trophy["id"].as_str().unwrap_or("")]) })
            .count()),
        "seriesView" => series_view(args),
        "isItemUnlocked" => json!(item_unlocked(&args["item"], &args["got"])),
        "unlockedIn" => json!(unlocked_in(&args["items"], &args["cat"], &args["got"])),
        "defaultEquip" => Value::Object(
            arr(&args["cats"])
                .iter()
                .map(|category| (category_key(category).to_owned(), json!("auto")))
                .collect(),
        ),
        "pickLook" => pick_look(args),
        "collectionMetrics" => collection_metrics(args),
        "trophyExtraMetrics" => trophy_extra_metrics(args),
        "countCrowns" => json!(count_crowns(&args["stickers"])),
        "variant" => {
            let id = &args["id"];
            if truthy(id) {
                id.as_str()
                    .and_then(|id| id.split(':').nth(1))
                    .map_or(Value::Null, |part| json!(part))
            } else {
                json!("classic")
            }
        }
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extra_metrics_count_date_keys_and_longest_calendar_run() {
        let args = json!({
            "doneDays":{"2024-03-01":false,"2026-01-01":1,"2024-02-28":null,
                "2025-12-31":0,"2024-02-29":true,"2024-03-03":false},
            "hammerUsed":4,
            "items":[{"id":"bg:classic","cat":"bg","base":true},
                {"id":"bg:night","cat":"bg","trophy":"streak-3"},
                {"id":"color:pink","cat":"color","base":true}],
            "cats":[{"key":"bg"},{"key":"color"}],"got":{}
        });
        assert_eq!(
            dispatch("trophyExtraMetrics", &args),
            Some(json!({
                "questDays":6,"questRun":3,"hammerUsed":4,"itemsOwned":2,"catComplete":1
            }))
        );
        assert_eq!(
            trophy_extra_metrics(&json!({})),
            json!({
                "questDays":0,"questRun":0,"hammerUsed":0,"itemsOwned":0,"catComplete":0
            })
        );
        assert_eq!(
            trophy_extra_metrics(&json!({"doneDays":{"2027-01-01":true,
            "2026-12-31":true,"2027-01-02":true,"invalid":true}}))["questRun"],
            3
        );
    }

    #[test]
    fn crowns_count_only_exact_matching_values() {
        assert_eq!(
            dispatch(
                "countCrowns",
                &json!({"stickers":{
                    "2026-09-01":"crown","2026-09-02":"star","2026-09-03":"crown",
                    "2026-09-04":"Crown","2026-09-05":true,"2026-09-06":null
                }})
            ),
            Some(json!(2))
        );
        assert_eq!(dispatch("countCrowns", &json!({})), Some(json!(0)));
        assert_eq!(
            dispatch("countCrowns", &json!({"stickers":["crown","star","crown"]})),
            Some(json!(2))
        );
    }

    #[test]
    fn metrics_cover_curriculum_stats_flags_and_extra_overrides() {
        let mut snap = json!({
            "stats":{"playMs":119999,"bestDopaL":3.9999999999,"problems":120,
                "flags":{"sunday":true,"hidden":false},"grades":{"1":4},
                "modes":{"level":1,"grade":2,"practice":1,"review":1}},
            "prog":{"skills":{}},"bestStreak":7,
            "extra":{"questDays":7,"crowns":12}
        });
        for skill in arr(crate::skills())
            .iter()
            .filter(|skill| skill["grade"] == 1)
        {
            snap["prog"]["skills"][skill["id"].as_str().unwrap()] =
                json!({"mastered":true,"stars":3});
        }
        snap["prog"]["skills"]["g1-add-nc"]["stars"] = json!(5);
        let metrics = trophy_metrics(&snap);
        assert_eq!(metrics["minutes"], 1);
        assert_eq!(metrics["bestDopaL"], 4);
        assert_eq!(metrics["bestStreak"], 7);
        assert_eq!(metrics["crowns"], 12);
        assert_eq!(metrics["gradeDone1"], 1);
        assert_eq!(metrics["gradeDone2"], 0);
        assert_eq!(metrics["gradeStar31"], 1);
        assert_eq!(metrics["gradeStar32"], 0);
        assert_eq!(metrics["gradePlays1"], 4);
        assert_eq!(metrics["starsTotal"], 26);
        assert_eq!(metrics["mastered"], 8);
        assert_eq!(metrics["star5"], 1);
        assert_eq!(metrics["flag:sunday"], 1);
        assert!(metrics.get("flag:hidden").is_none());
        assert_eq!(metrics["allModes"], 1);
        assert_eq!(metrics["questDays"], 7);
        let empty = trophy_metrics(&json!({}));
        assert_eq!(empty["unlocked"], 2);
        assert_eq!(empty["starsTotal"], 0);
        assert_eq!(empty["allModes"], 0);
        assert_eq!(empty["laneDone3"], 0);
    }

    #[test]
    fn trophies_batch_once_keep_rewards_and_preserve_order() {
        let trophies = json!([
            {"id":"a","metric":"plays","need":1,"name":"First round"},
            {"id":"b","metric":"plays","need":3},
            {"id":"c","metric":"days","need":1}
        ]);
        let first = evaluate_trophies(
            &json!({"trophies":trophies,"state":{},"metrics":{"plays":1,"days":1},"at":123}),
        );
        assert_eq!(first["result"], json!([]));
        assert_eq!(first["state"]["batch"], json!(["a", "c"]));
        assert_eq!(first["state"]["got"], json!({"a":123,"c":123}));
        let next = evaluate_trophies(
            &json!({"trophies":trophies,"state":first["state"],"metrics":{"plays":4},"at":456}),
        );
        assert_eq!(next["result"], json!([trophies[1]]));
        assert_eq!(next["state"]["got"], json!({"a":123,"c":123,"b":456}));
        assert_eq!(next["state"]["batch"], first["state"]["batch"]);
        assert_eq!(
            dispatch(
                "earnedCount",
                &json!({"state":next["state"],"trophies":trophies})
            ),
            Some(json!(3))
        );
        let fresh = evaluate_trophies(
            &json!({"state":{"init":true},"trophies":trophies,"metrics":{"plays":3,"days":1},"at":1}),
        );
        assert_eq!(fresh["result"], trophies);
    }

    #[test]
    fn series_progress_preserves_catalog_objects_and_missing_next() {
        let series = json!({"key":"plays","items":[
            {"id":"a","metric":"plays","need":1},
            {"id":"b","metric":"plays","need":3}
        ]});
        let first =
            series_view(&json!({"series":series,"state":{"got":{"a":1}},"metrics":{"plays":2}}));
        assert_eq!(first["top"], series["items"][0]);
        assert_eq!(first["next"], series["items"][1]);
        assert_eq!(first["value"], 2);
        let full = series_view(&json!({"series":series,"state":{"got":{"a":1,"b":1}}}));
        assert!(full.get("next").is_none());
        assert!(full["value"].is_null());
        assert_eq!(full["top"], series["items"][1]);
        let empty = series_view(&json!({"series":{"items":[]}}));
        assert!(empty["top"].is_null());
    }

    #[test]
    fn cosmetic_selection_consumes_draws_only_for_auto_or_invalid_choices() {
        let items = json!([
            {"id":"bg:classic","cat":"bg","base":true},
            {"id":"bg:night","cat":"bg","trophy":"streak-3"},
            {"id":"color:pink","cat":"color","base":true},
            {"id":"color:blue","cat":"color","trophy":"plays-5"},
            {"id":"costume:none","cat":"costume","base":true},
            {"id":"costume:cap","cat":"costume","trophy":"days-1"}
        ]);
        let cats = json!([{"key":"bg"},{"key":"color"},{"key":"costume"}]);
        let got = json!({"streak-3":1,"days-1":1});
        assert!(item_unlocked(&items[1], &got));
        assert!(!item_unlocked(&items[3], &got));
        assert!(!item_unlocked(&Value::Null, &got));
        assert_eq!(
            unlocked_in(&items, &json!("bg"), &got),
            vec![&items[0], &items[1]]
        );
        let args = json!({"cats":cats,"items":items,"got":got,
            "equip":{"bg":"bg:night","color":"color:blue"},"random":[0.3,0.999]});
        assert_eq!(
            pick_look(&args),
            json!({"result":{"bg":"bg:night","color":"color:pink","costume":"costume:cap"},"consumed":2})
        );
        assert_eq!(
            dispatch("defaultEquip", &json!({"cats":cats})),
            Some(json!({"bg":"auto","color":"auto","costume":"auto"}))
        );
        assert_eq!(
            collection_metrics(&args),
            json!({"itemsOwned":5,"catComplete":2})
        );
        assert_eq!(
            dispatch("variant", &json!({"id":"bg:night"})),
            Some(json!("night"))
        );
        assert_eq!(dispatch("variant", &json!({})), Some(json!("classic")));
        assert!(dispatch("unknown", &json!({})).is_none());
    }
}
