//! Calendar history, no-count hammers, and daily login rewards.
//!
//! The browser supplies its local `YYYY-MM-DD` and (for hammer logs) epoch
//! milliseconds. Day arithmetic never uses elapsed milliseconds, so daylight
//! saving transitions cannot break consecutive-day rewards. Mutating operations
//! return both the complete saved state and the original JavaScript result.
use serde_json::{json, Map, Value};
use std::collections::{BTreeSet, HashSet};

const HAMMER_MAX: f64 = 3.0;
const HAMMER_REACH: i64 = 7;
const STICKERS: [&str; 7] = [
    "star", "heart", "flower", "note", "clover", "hanamaru", "crown",
];

fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(value) => *value,
        Value::Number(value) => value.as_f64().is_some_and(|n| n != 0.0),
        Value::String(value) => !value.is_empty(),
        _ => true,
    }
}

fn number(value: Option<&Value>) -> f64 {
    match value {
        None => f64::NAN,
        Some(Value::Null) => 0.0,
        Some(Value::Bool(value)) => f64::from(*value),
        Some(Value::Number(value)) => value.as_f64().unwrap_or(f64::NAN),
        Some(Value::String(value)) => {
            let value = value.trim();
            if value.is_empty() {
                0.0
            } else {
                value.parse().unwrap_or(f64::NAN)
            }
        }
        Some(Value::Array(_)) => number(Some(&Value::String(property_key(value.unwrap())))),
        _ => f64::NAN,
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

fn property_key(value: &Value) -> String {
    match value {
        Value::String(value) => value.clone(),
        Value::Object(_) => "[object Object]".into(),
        Value::Array(values) => values
            .iter()
            .map(|value| {
                if value.is_null() {
                    String::new()
                } else {
                    property_key(value)
                }
            })
            .collect::<Vec<_>>()
            .join(","),
        _ => value.to_string(),
    }
}

fn add_number(value: Option<&Value>, amount: f64) -> Value {
    match value {
        Some(value @ (Value::String(_) | Value::Array(_) | Value::Object(_))) => {
            json!(format!("{}{}", property_key(value), amount))
        }
        _ => numeric(number(value) + amount),
    }
}

fn object(value: &mut Value) -> &mut Map<String, Value> {
    if !value.is_object() {
        *value = json!({});
    }
    value.as_object_mut().unwrap()
}

fn array(value: &Value) -> &[Value] {
    value.as_array().map(Vec::as_slice).unwrap_or(&[])
}

// Gregorian civil dates, with 1970-01-01 = 0. Only canonical dayKey strings
// participate in calendar arithmetic; unrelated/corrupt saved keys are kept.
fn day_number(key: &str) -> Option<i64> {
    let mut pieces = key.rsplitn(3, '-');
    let day = pieces.next()?.parse::<i64>().ok()?;
    let month = pieces.next()?.parse::<i64>().ok()?;
    let mut year = pieces.next()?.parse::<i64>().ok()?;
    if !(-1_000_000..=1_000_000).contains(&year)
        || !(1..=12).contains(&month)
        || !(1..=31).contains(&day)
    {
        return None;
    }
    year -= i64::from(month <= 2);
    let era = year.div_euclid(400);
    let year_of_era = year - era * 400;
    let shifted_month = month + if month > 2 { -3 } else { 9 };
    let day_of_year = (153 * shifted_month + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    let n = era * 146_097 + day_of_era - 719_468;
    (day_key(n) == key).then_some(n)
}

fn day_key(day: i64) -> String {
    let z = day + 719_468;
    let era = z.div_euclid(146_097);
    let day_of_era = z - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let shifted_month = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * shifted_month + 2) / 5 + 1;
    let month = shifted_month + if shifted_month < 10 { 3 } else { -9 };
    year += i64::from(month <= 2);
    format!("{year}-{month:02}-{day:02}")
}

struct Calendar {
    played: HashSet<i64>,
    nocount: HashSet<i64>,
    all_nocount: HashSet<i64>,
}

impl Calendar {
    fn new(state: &Value) -> Self {
        let played = array(&state["history"])
            .iter()
            .filter_map(|entry| day_number(entry["day"].as_str()?))
            .collect();
        let mut nocount = HashSet::new();
        let mut all_nocount = HashSet::new();
        if let Some(days) = state["nocount"].as_object() {
            for (key, value) in days {
                if let Some(day) = day_number(key) {
                    all_nocount.insert(day);
                    if truthy(value) {
                        nocount.insert(day);
                    }
                }
            }
        }
        Self {
            played,
            nocount,
            all_nocount,
        }
    }

    fn streak(&self, mut today: i64) -> usize {
        if !self.played.contains(&today) {
            today -= 1;
        }
        let mut count = 0;
        // Each successful step consumes a distinct known calendar day.
        for _ in 0..=self.played.len() + self.nocount.len() {
            let played = self.played.contains(&today);
            if !played && !self.nocount.contains(&today) {
                break;
            }
            count += usize::from(played);
            today -= 1;
        }
        count
    }

    fn best_streak(&self) -> usize {
        // Match Object.keys(nocount): even a false-valued key bridges the best
        // historical run, although it does not bridge the current streak.
        let days: BTreeSet<_> = self.played.union(&self.all_nocount).copied().collect();
        let mut previous = None;
        let mut run = 0;
        let mut best = 0;
        for day in days {
            if previous != Some(day - 1) {
                run = 0;
            }
            run += usize::from(self.played.contains(&day));
            best = best.max(run);
            previous = Some(day);
        }
        best
    }
}

fn month_summary(state: &Value, args: &Value) -> Value {
    let year = args.get("year").map(property_key).unwrap_or_default();
    let month = args.get("month").map(|v| add_number(Some(v), 1.0));
    let month = month.as_ref().map(property_key).unwrap_or_default();
    let prefix = format!("{year}-{:0>2}-", month);
    let mut summary = Map::new();
    for entry in array(&state["history"]) {
        let Some(day) = entry["day"].as_str().filter(|day| day.starts_with(&prefix)) else {
            continue;
        };
        let bucket = summary
            .entry(day.to_owned())
            .or_insert_with(|| json!({"best":0,"plays":0,"entries":[]}));
        bucket["entries"]
            .as_array_mut()
            .unwrap()
            .push(entry.clone());
    }
    for bucket in summary.values_mut() {
        let entries = array(&bucket["entries"]);
        let mut best: f64 = 0.0;
        for entry in entries {
            let score = if truthy(&entry["score"]) {
                number(entry.get("score"))
            } else {
                0.0
            };
            best = if best.is_nan() || score.is_nan() {
                f64::NAN
            } else {
                best.max(score)
            };
        }
        let plays = entries.len();
        bucket["best"] = numeric(best);
        bucket["plays"] = json!(plays);
    }
    Value::Object(summary)
}

fn items(state: &mut Value) -> &mut Value {
    if !truthy(&state["items"]) {
        state["items"] = json!({"hammer":1,"got":1,"used":0,"asked":null,"log":[]});
    }
    &mut state["items"]
}

fn add_hammer(state: &mut Value, amount: f64) -> Value {
    let items = items(state);
    let available = HAMMER_MAX - number(items.get("hammer"));
    let add = if available.is_nan() || amount.is_nan() {
        f64::NAN
    } else {
        amount.min(available).max(0.0)
    };
    let hammer = add_number(items.get("hammer"), add);
    let got = add_number(items.get("got"), add);
    object(items).insert("hammer".into(), hammer);
    object(items).insert("got".into(), got);
    numeric(add)
}

fn hammer_offer(state: &mut Value, today_key: &str) -> Value {
    let items = items(state);
    if items["asked"].as_str() == Some(today_key) || !truthy(&items["hammer"]) {
        return Value::Null;
    }
    let hammers = items["hammer"].clone();
    let Some(today) = day_number(today_key) else {
        return Value::Null;
    };
    let calendar = Calendar::new(state);
    let mut gap = Vec::new();
    let mut last = None;
    for offset in 1..=HAMMER_REACH {
        let day = today - offset;
        if calendar.played.contains(&day) {
            last = Some(day);
            break;
        }
        if !calendar.nocount.contains(&day) {
            gap.push(day_key(day));
        }
    }
    let Some(last) = last else {
        return Value::Null;
    };
    if gap.is_empty() || gap.len() as f64 > number(Some(&hammers)) {
        return Value::Null;
    }
    let run = calendar.streak(last);
    if run < 2 {
        return Value::Null;
    }
    gap.reverse();
    json!({"days":gap,"run":run,"hammers":hammers})
}

fn use_hammer(state: &mut Value, args: &Value) -> Value {
    let days = array(&args["days"]);
    let items = items(state);
    if days.is_empty() || days.len() as f64 > number(items.get("hammer")) {
        return json!(false);
    }
    let hammer = numeric(number(items.get("hammer")) - days.len() as f64);
    let used = add_number(items.get("used"), days.len() as f64);
    for day in days {
        object(&mut state["nocount"]).insert(property_key(day), json!(true));
    }
    let items = object(&mut state["items"]);
    items.insert("hammer".into(), hammer);
    items.insert("used".into(), used);
    items.insert("asked".into(), args["today"].clone());
    let log = items.entry("log").or_insert_with(|| json!([]));
    if !log.is_array() {
        *log = json!([]);
    }
    let log = log.as_array_mut().unwrap();
    log.push(json!({"at":args["at"],"days":days}));
    if log.len() > 50 {
        log.drain(..log.len() - 50);
    }
    json!(true)
}

fn claim_login(state: &mut Value, today_key: &str) -> Value {
    if !truthy(&state["bonus"]) {
        state["bonus"] = json!({"last":null,"run":0,"stickers":{},"total":0});
    }
    if state["bonus"]["last"].as_str() == Some(today_key) {
        return Value::Null;
    }
    let Some(today) = day_number(today_key) else {
        return Value::Null;
    };
    let last = state["bonus"]["last"].as_str().and_then(day_number);
    let calendar = Calendar::new(state);
    let mut previous = today - 1;
    for _ in 0..calendar.nocount.len() {
        if last == Some(previous) || !calendar.nocount.contains(&previous) {
            break;
        }
        previous -= 1;
    }
    let run = if last == Some(previous) {
        add_number(state["bonus"].get("run"), 1.0)
    } else {
        json!(1)
    };
    let slot = ((number(Some(&run)) - 1.0) % 7.0) + 1.0;
    let sticker = if slot.is_finite() && slot.fract() == 0.0 && (1.0..=7.0).contains(&slot) {
        json!(STICKERS[slot as usize - 1])
    } else {
        Value::Null
    };
    let total = if truthy(&state["bonus"]["total"]) {
        add_number(state["bonus"].get("total"), 1.0)
    } else {
        json!(1)
    };
    let bonus = object(&mut state["bonus"]);
    bonus.insert("run".into(), run.clone());
    bonus.insert("last".into(), json!(today_key));
    bonus.insert("total".into(), total.clone());
    let stickers = bonus.entry("stickers").or_insert_with(|| json!({}));
    object(stickers).insert(today_key.to_owned(), sticker.clone());
    json!({"run":run,"slot":numeric(slot),"type":sticker,"total":total})
}

/// Read operations return their result directly. Mutation-capable operations
/// return `{"state": <complete saved JSON>, "result": <original JS result>}`.
/// `today` is a local day key; `at` is the caller's epoch milliseconds.
pub fn dispatch(op: &str, args: &Value) -> Option<Value> {
    match op {
        "storeMonthSummary" => Some(month_summary(&args["state"], args)),
        "storeStreak" => {
            let calendar = Calendar::new(&args["state"]);
            let run = args["today"]
                .as_str()
                .and_then(day_number)
                .map(|today| calendar.streak(today))
                .unwrap_or(0);
            Some(json!(run))
        }
        "storeBestStreak" => Some(json!(Calendar::new(&args["state"]).best_streak())),
        "storeItems" | "storeAddHammer" | "storeHammerOffer" | "storeUseHammer"
        | "storeClaimLogin" => {
            let mut state = args["state"].clone();
            object(&mut state);
            let today = args["today"].as_str().unwrap_or("");
            let result = match op {
                "storeItems" => items(&mut state).clone(),
                "storeAddHammer" => {
                    let amount = args.get("n").map(|n| number(Some(n))).unwrap_or(1.0);
                    add_hammer(&mut state, amount)
                }
                "storeHammerOffer" => hammer_offer(&mut state, today),
                "storeUseHammer" => use_hammer(&mut state, args),
                "storeClaimLogin" => claim_login(&mut state, today),
                _ => unreachable!(),
            };
            Some(json!({"state":state,"result":result}))
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn call(op: &str, args: Value) -> Value {
        dispatch(op, &args).unwrap()
    }

    fn state(days: &[&str]) -> Value {
        json!({"version":1,"history":days.iter().map(|day| json!({"day":day,"score":100})).collect::<Vec<_>>()})
    }

    fn mutate(op: &str, state: &mut Value, mut args: Value) -> Value {
        args["state"] = state.clone();
        let response = call(op, args);
        *state = response["state"].clone();
        response["result"].clone()
    }

    #[test]
    fn month_groups_records_and_preserves_full_entries() {
        let saved = json!({"history":[
            {"day":"2026-09-25","score":100,"custom":{"a":[1,2]}},
            {"day":"2026-09-26","score":410},
            {"day":"2026-09-26","score":100},
            {"day":"2026-08-26","score":999},
            {"day":"2026-09-27","score":-3},
            {"score":777},
            {"day":"2026-09-27"}
        ]});
        let summary = call(
            "storeMonthSummary",
            json!({"state":saved,"year":2026,"month":8}),
        );
        assert_eq!(summary.as_object().unwrap().len(), 3);
        assert_eq!(summary["2026-09-26"]["best"], 410);
        assert_eq!(summary["2026-09-26"]["plays"], 2);
        assert_eq!(summary["2026-09-27"]["best"], 0);
        assert_eq!(summary["2026-09-25"]["entries"][0], saved["history"][0]);
    }

    #[test]
    fn streak_starts_today_or_yesterday_and_deduplicates_plays() {
        let saved = state(&["2026-09-25", "2026-09-26", "2026-09-26", "2026-09-27"]);
        for (today, run) in [("2026-09-27", 3), ("2026-09-28", 3), ("2026-09-30", 0)] {
            assert_eq!(
                call("storeStreak", json!({"state":saved,"today":today})),
                run
            );
        }
        let saved = state(&[
            "2026-09-01",
            "2026-09-02",
            "2026-09-03",
            "2026-09-05",
            "2026-09-06",
        ]);
        assert_eq!(call("storeBestStreak", json!({"state":saved})), 3);
    }

    #[test]
    fn calendar_arithmetic_handles_leap_days_centuries_and_years() {
        assert_eq!(day_number("1970-01-01"), Some(0));
        assert_eq!(day_number("1969-12-31"), Some(-1));
        assert_eq!(day_key(day_number("2024-03-01").unwrap() - 1), "2024-02-29");
        assert_eq!(day_key(day_number("2025-03-01").unwrap() - 1), "2025-02-28");
        assert_eq!(day_key(day_number("2000-03-01").unwrap() - 1), "2000-02-29");
        assert_eq!(day_key(day_number("2100-03-01").unwrap() - 1), "2100-02-28");
        assert_eq!(day_key(day_number("2026-01-01").unwrap() - 1), "2025-12-31");
        for invalid in ["2025-02-29", "2026-04-31", "2026-13-01", "bad", "2026-1-01"] {
            assert_eq!(day_number(invalid), None);
        }
        for days in [
            ["2024-02-28", "2024-02-29", "2024-03-01"],
            ["2025-12-30", "2025-12-31", "2026-01-01"],
        ] {
            let saved = state(&days);
            assert_eq!(
                call("storeStreak", json!({"state":saved,"today":days[2]})),
                3
            );
            assert_eq!(call("storeBestStreak", json!({"state":saved})), 3);
        }
    }

    #[test]
    fn local_dates_ignore_23_and_25_hour_dst_intervals() {
        // US spring/fall and European spring/fall boundaries. These dates are
        // supplied by local Date getters, never derived from UTC timestamps.
        for days in [
            ["2026-03-07", "2026-03-08", "2026-03-09"],
            ["2026-10-31", "2026-11-01", "2026-11-02"],
            ["2026-03-28", "2026-03-29", "2026-03-30"],
            ["2026-10-24", "2026-10-25", "2026-10-26"],
        ] {
            let mut saved = state(&days);
            assert_eq!(
                call("storeStreak", json!({"state":saved,"today":days[2]})),
                3
            );
            assert_eq!(call("storeBestStreak", json!({"state":saved})), 3);
            for (i, day) in days.iter().enumerate() {
                assert_eq!(
                    mutate("storeClaimLogin", &mut saved, json!({"today":day}))["run"],
                    i + 1
                );
            }
        }
    }

    #[test]
    fn item_initialization_additions_and_unknown_fields_are_preserved() {
        let mut saved = json!({"history":[],"unknown":{"future":[1,2]},"settings":{"volume":0.25}});
        assert_eq!(
            mutate("storeItems", &mut saved, json!({})),
            json!({"hammer":1,"got":1,"used":0,"asked":null,"log":[]})
        );
        assert_eq!(mutate("storeAddHammer", &mut saved, json!({})), 1);
        assert_eq!(mutate("storeAddHammer", &mut saved, json!({"n":5})), 1);
        assert_eq!(mutate("storeAddHammer", &mut saved, json!({"n":-5})), 0);
        saved["items"]["custom"] = json!(["keep"]);
        assert_eq!(mutate("storeAddHammer", &mut saved, json!({"n":100})), 0);
        assert_eq!(saved["items"]["hammer"], 3);
        assert_eq!(saved["items"]["got"], 3);
        assert_eq!(saved["items"]["custom"], json!(["keep"]));
        assert_eq!(saved["unknown"], json!({"future":[1,2]}));
        assert_eq!(saved["settings"], json!({"volume":0.25}));
    }

    #[test]
    fn hammer_offer_and_use_bridge_play_and_login_runs() {
        let mut saved = state(&["2026-09-01", "2026-09-02", "2026-09-03"]);
        for day in ["2026-09-01", "2026-09-02", "2026-09-03"] {
            mutate("storeClaimLogin", &mut saved, json!({"today":day}));
        }
        let offer = mutate(
            "storeHammerOffer",
            &mut saved,
            json!({"today":"2026-09-05"}),
        );
        assert_eq!(offer, json!({"days":["2026-09-04"],"run":3,"hammers":1}));
        assert_eq!(
            mutate(
                "storeUseHammer",
                &mut saved,
                json!({"days":offer["days"],"today":"2026-09-05","at":123456789})
            ),
            true
        );
        assert_eq!(saved["items"]["hammer"], 0);
        assert_eq!(saved["items"]["used"], 1);
        assert_eq!(
            saved["items"]["log"][0],
            json!({"at":123456789,"days":["2026-09-04"]})
        );
        assert_eq!(
            mutate(
                "storeHammerOffer",
                &mut saved,
                json!({"today":"2026-09-05"})
            ),
            Value::Null
        );
        assert_eq!(
            call("storeStreak", json!({"state":saved,"today":"2026-09-05"})),
            3
        );
        saved["history"]
            .as_array_mut()
            .unwrap()
            .push(json!({"day":"2026-09-05"}));
        assert_eq!(
            call("storeStreak", json!({"state":saved,"today":"2026-09-05"})),
            4
        );
        assert_eq!(call("storeBestStreak", json!({"state":saved})), 4);
        assert_eq!(
            mutate("storeClaimLogin", &mut saved, json!({"today":"2026-09-05"}))["run"],
            4
        );
        assert_eq!(mutate("storeAddHammer", &mut saved, json!({"n":5})), 3);
        saved["items"]["hammer"] = json!(1);
        assert_eq!(
            mutate(
                "storeHammerOffer",
                &mut saved,
                json!({"today":"2026-09-08"})
            ),
            Value::Null
        );
        saved["items"]["hammer"] = json!(2);
        assert_eq!(
            mutate(
                "storeHammerOffer",
                &mut saved,
                json!({"today":"2026-09-08"})
            )["days"],
            json!(["2026-09-06", "2026-09-07"])
        );
        saved["items"]["asked"] = json!("2026-09-08");
        assert_eq!(
            mutate(
                "storeHammerOffer",
                &mut saved,
                json!({"today":"2026-09-08"})
            ),
            Value::Null
        );
        assert_eq!(
            mutate(
                "storeHammerOffer",
                &mut saved,
                json!({"today":"2026-09-20"})
            ),
            Value::Null
        );
    }

    #[test]
    fn hammer_offer_reach_and_calendar_boundaries() {
        let mut saved = state(&["2024-02-26", "2024-02-27"]);
        saved["nocount"] = json!({"2024-02-28":true});
        assert_eq!(
            mutate(
                "storeHammerOffer",
                &mut saved,
                json!({"today":"2024-03-01"})
            ),
            json!({"days":["2024-02-29"],"run":2,"hammers":1})
        );
        let mut saved = state(&["2025-12-29", "2025-12-30"]);
        assert_eq!(
            mutate(
                "storeHammerOffer",
                &mut saved,
                json!({"today":"2026-01-01"})
            )["days"],
            json!(["2025-12-31"])
        );
        let mut saved = state(&["2026-09-01", "2026-09-02"]);
        saved["nocount"] = json!({"2026-09-03":true,"2026-09-04":true,"2026-09-05":true,"2026-09-06":true,"2026-09-07":true});
        assert_eq!(
            mutate(
                "storeHammerOffer",
                &mut saved,
                json!({"today":"2026-09-09"})
            )["days"],
            json!(["2026-09-08"])
        );
        assert_eq!(
            mutate(
                "storeHammerOffer",
                &mut saved,
                json!({"today":"2026-09-10"})
            ),
            Value::Null
        );
        let mut saved = state(&["2026-09-01"]);
        assert_eq!(
            mutate(
                "storeHammerOffer",
                &mut saved,
                json!({"today":"2026-09-03"})
            ),
            Value::Null
        );
    }

    #[test]
    fn hammer_use_keeps_original_counting_and_caps_the_log() {
        let mut saved = state(&[]);
        mutate("storeItems", &mut saved, json!({}));
        let before = saved.clone();
        assert_eq!(
            mutate(
                "storeUseHammer",
                &mut saved,
                json!({"days":[],"today":"2026-09-01","at":1})
            ),
            false
        );
        assert_eq!(saved, before);
        assert_eq!(
            mutate(
                "storeUseHammer",
                &mut saved,
                json!({"days":["2026-08-30","2026-08-31"],"today":"2026-09-01","at":1})
            ),
            false
        );
        assert_eq!(saved, before);
        saved["items"]["hammer"] = json!(3);
        saved["items"]["log"] = json!((0..60)
            .map(|n| json!({"at":n,"days":[]}))
            .collect::<Vec<_>>());
        // The original API counts duplicate days and does not enforce reach
        // at use time; only the offer calculation enforces that restriction.
        assert_eq!(
            mutate(
                "storeUseHammer",
                &mut saved,
                json!({"days":["2020-01-01","2020-01-01"],"today":"2026-09-01","at":99})
            ),
            true
        );
        assert_eq!(saved["items"]["hammer"], 1);
        assert_eq!(saved["items"]["used"], 2);
        assert_eq!(saved["nocount"], json!({"2020-01-01":true}));
        assert_eq!(saved["items"]["log"].as_array().unwrap().len(), 50);
        assert_eq!(saved["items"]["log"][0]["at"], 11);
        assert_eq!(saved["items"]["log"][49]["at"], 99);
    }

    #[test]
    fn login_card_is_once_daily_cycles_and_restarts_after_gaps() {
        let mut saved = state(&[]);
        assert_eq!(
            mutate("storeClaimLogin", &mut saved, json!({"today":"2026-09-01"})),
            json!({"run":1,"slot":1,"type":"star","total":1})
        );
        let before = saved.clone();
        assert_eq!(
            mutate("storeClaimLogin", &mut saved, json!({"today":"2026-09-01"})),
            Value::Null
        );
        assert_eq!(saved, before);
        let mut result = Value::Null;
        for day in 2..=8 {
            result = mutate(
                "storeClaimLogin",
                &mut saved,
                json!({"today":format!("2026-09-{day:02}")}),
            );
        }
        assert_eq!(result, json!({"run":8,"slot":1,"type":"star","total":8}));
        assert_eq!(saved["bonus"]["stickers"]["2026-09-07"], "crown");
        saved["bonus"]["unknown"] = json!(42);
        assert_eq!(
            mutate("storeClaimLogin", &mut saved, json!({"today":"2026-09-12"})),
            json!({"run":1,"slot":1,"type":"star","total":9})
        );
        assert_eq!(saved["bonus"]["unknown"], 42);
    }

    #[test]
    fn login_bridges_nocount_but_stops_on_last_visit() {
        let mut saved = state(&[]);
        mutate("storeClaimLogin", &mut saved, json!({"today":"2025-12-30"}));
        saved["nocount"] = json!({"2025-12-30":true,"2025-12-31":true,"2026-01-01":true});
        assert_eq!(
            mutate("storeClaimLogin", &mut saved, json!({"today":"2026-01-02"}))["run"],
            2
        );
        saved["nocount"]["2026-01-03"] = json!(false);
        assert_eq!(
            mutate("storeClaimLogin", &mut saved, json!({"today":"2026-01-04"}))["run"],
            1
        );
    }

    #[test]
    fn false_nocount_keys_only_bridge_the_historical_best() {
        let mut saved = state(&["2026-09-01", "2026-09-02", "2026-09-04"]);
        saved["nocount"] = json!({"2026-09-03":false,"2026-09-05":true});
        assert_eq!(call("storeBestStreak", json!({"state":saved})), 3);
        assert_eq!(
            call("storeStreak", json!({"state":saved,"today":"2026-09-04"})),
            1
        );
        assert_eq!(
            call("storeStreak", json!({"state":saved,"today":"2026-09-06"})),
            1
        );
        let empty = json!({"history":[],"nocount":{"2026-09-01":true,"2026-09-02":true}});
        assert_eq!(
            call("storeStreak", json!({"state":empty,"today":"2026-09-03"})),
            0
        );
        assert_eq!(call("storeBestStreak", json!({"state":empty})), 0);
    }

    #[test]
    fn malformed_dates_do_not_create_unbounded_traversals() {
        let saved = json!({"history":[{},null,{"day":"bad"},{"day":"2026-13-99"}],"nocount":{"bad":true,"999999999999999999999-01-01":true}});
        assert_eq!(
            call("storeStreak", json!({"state":saved,"today":"2026-09-30"})),
            0
        );
        assert_eq!(call("storeBestStreak", json!({"state":saved})), 0);
        assert_eq!(call("storeStreak", json!({"state":saved,"today":"bad"})), 0);
        assert_eq!(dispatch("unsupported", &json!({})), None);
    }
}
