//! Pure progress and adaptive planning over the application's saved JSON schema.
//! All clocks and random draws are supplied by the caller, making native and
//! WebAssembly behavior identical and deterministic.
use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

const MASTERY_WINDOW: usize = 6;
const MASTERY_NEED: f64 = 5.0;
const DAY_MS: f64 = 86_400_000.0;
const TIMES_MAX: usize = 30;
const FIRST_MAX: usize = 3;
const DAYS_MAX: usize = 60;

struct Catalog {
    ids: Vec<String>,
    grade: Vec<i64>,
    req: Vec<Vec<usize>>,
    depth: Vec<usize>,
    order: Vec<usize>,
    placement: Vec<usize>,
    index: HashMap<String, usize>,
}

fn catalog() -> &'static Catalog {
    static CATALOG: OnceLock<Catalog> = OnceLock::new();
    CATALOG.get_or_init(|| {
        let skills = crate::skills().as_array().expect("skill metadata array");
        let ids: Vec<String> = skills
            .iter()
            .map(|s| s["id"].as_str().unwrap().to_owned())
            .collect();
        let index: HashMap<String, usize> = ids
            .iter()
            .cloned()
            .enumerate()
            .map(|(i, id)| (id, i))
            .collect();
        let grade = skills
            .iter()
            .map(|s| s["grade"].as_i64().unwrap_or(1))
            .collect::<Vec<_>>();
        let req = skills
            .iter()
            .map(|s| {
                s["req"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .filter_map(|r| index.get(r.as_str()?).copied())
                    .collect::<Vec<_>>()
            })
            .collect::<Vec<_>>();
        fn depth_of(i: usize, req: &[Vec<usize>], memo: &mut [Option<usize>]) -> usize {
            if let Some(d) = memo[i] {
                return d;
            }
            let d = req[i]
                .iter()
                .map(|&p| depth_of(p, req, memo) + 1)
                .max()
                .unwrap_or(0);
            memo[i] = Some(d);
            d
        }
        let mut memo = vec![None; ids.len()];
        let depth = (0..ids.len())
            .map(|i| depth_of(i, &req, &mut memo))
            .collect::<Vec<_>>();
        let mut order: Vec<usize> = (0..ids.len()).collect();
        order.sort_by_key(|&i| (depth[i], grade[i], i));
        let mut placement: Vec<usize> = (0..ids.len()).collect();
        placement.sort_by_key(|&i| (grade[i], depth[i], i));
        Catalog {
            ids,
            grade,
            req,
            depth,
            order,
            placement,
            index,
        }
    })
}

fn truthy(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().is_some_and(|n| n != 0.0 && !n.is_nan()),
        Value::String(s) => !s.is_empty(),
        _ => true,
    }
}
fn num(v: &Value) -> f64 {
    v.as_f64().unwrap_or(0.0)
}
fn numeric(n: f64) -> Value {
    if n.is_finite() && n.fract() == 0.0 && n >= i64::MIN as f64 && n < i64::MAX as f64 {
        json!(n as i64)
    } else {
        json!(n)
    }
}
fn arr(v: &Value) -> &[Value] {
    v.as_array().map(Vec::as_slice).unwrap_or(&[])
}
fn object(v: &mut Value) -> &mut Map<String, Value> {
    if !v.is_object() {
        *v = json!({});
    }
    v.as_object_mut().unwrap()
}
fn array(v: &mut Value) -> &mut Vec<Value> {
    if !v.is_array() {
        *v = json!([]);
    }
    v.as_array_mut().unwrap()
}
fn tail(v: &Value, n: usize) -> &[Value] {
    let a = arr(v);
    &a[a.len().saturating_sub(n)..]
}
fn append_bounded(v: &mut Value, entry: Value, cap: usize) {
    let a = array(v);
    a.push(entry);
    if a.len() > cap {
        a.drain(..a.len() - cap);
    }
}
fn empty_progress() -> Value {
    json!({"placed":false,"skills":{},"review":[]})
}
fn progress_arg(args: &Value) -> Value {
    if args["prog"].is_object() {
        args["prog"].clone()
    } else {
        empty_progress()
    }
}
fn rec<'a>(prog: &'a mut Value, id: &str) -> &'a mut Value {
    object(prog).entry("skills").or_insert_with(|| json!({}));
    let r = object(&mut prog["skills"])
        .entry(id.to_owned())
        .or_insert_with(|| json!({"n":0,"hist":[],"mastered":false,"recent":[]}));
    if !r.is_object() {
        *r = json!({"n":0,"hist":[],"mastered":false,"recent":[]});
    }
    r
}
fn mastered(prog: &Value, id: &str) -> bool {
    truthy(&prog["skills"][id]["mastered"])
}
fn unlocked_index(prog: &Value, i: usize) -> bool {
    let c = catalog();
    c.req[i].iter().all(|&p| mastered(prog, &c.ids[p]))
}
fn unlocked(prog: &Value, id: &str) -> bool {
    catalog()
        .index
        .get(id)
        .is_some_and(|&i| unlocked_index(prog, i))
}
fn state_of(prog: &Value, id: &str) -> &'static str {
    if mastered(prog, id) {
        "mastered"
    } else if unlocked(prog, id) {
        if truthy(&prog["skills"][id]["n"]) {
            "learning"
        } else {
            "new"
        }
    } else {
        "locked"
    }
}
fn mastery_ratio(prog: &Value, id: &str) -> f64 {
    let r = &prog["skills"][id];
    if truthy(&r["mastered"]) {
        1.0
    } else {
        (arr(&r["hist"]).iter().map(num).sum::<f64>() / MASTERY_NEED).min(0.95)
    }
}

// One fresh, read-only snapshot for a complete skill-tree/title render. Reuse
// the same rule helpers as the individual queries; no state is cached here.
fn skill_views(prog: &Value) -> Value {
    let mut views = Map::with_capacity(catalog().ids.len());
    for id in &catalog().ids {
        views.insert(
            id.clone(),
            json!({
                "state": state_of(prog, id),
                "stars": numeric(stars_of(prog, id)),
                "ratio": numeric(mastery_ratio(prog, id)),
            }),
        );
    }
    Value::Object(views)
}

fn master_ancestors(prog: &mut Value, id: &str, at: f64) {
    let c = catalog();
    let Some(&i) = c.index.get(id) else {
        return;
    };
    let r = rec(prog, id);
    r["mastered"] = json!(true);
    if !truthy(&r["masteredAt"]) {
        r["masteredAt"] = numeric(at);
    }
    if !truthy(&r["grantedAt"]) {
        r["grantedAt"] = numeric(at);
    }
    r["stars"] = numeric(num(&r["stars"]).max(1.0));
    for &p in &c.req[i] {
        if !mastered(prog, &c.ids[p]) {
            master_ancestors(prog, &c.ids[p], at);
        }
    }
}
fn rust_clock(r: &Value) -> f64 {
    for k in ["lastOk", "grantedAt", "masteredAt"] {
        if truthy(&r[k]) {
            return num(&r[k]);
        }
    }
    0.0
}
fn rusty(prog: &Value, now: f64) -> Vec<String> {
    let c = catalog();
    let Some(records) = prog["skills"].as_object() else {
        return vec![];
    };
    let mut out = records
        .iter()
        .filter(|(id, r)| {
            c.index.contains_key(*id)
                && truthy(&r["mastered"])
                && rust_clock(r) != 0.0
                && now - rust_clock(r) >= 21.0 * DAY_MS
        })
        .collect::<Vec<_>>();
    // Stable sort preserves Object.entries order when clock values are equal.
    out.sort_by(|a, b| rust_clock(a.1).total_cmp(&rust_clock(b.1)));
    out.into_iter().take(3).map(|(id, _)| id.clone()).collect()
}
fn base_ms(grade: f64, cells: f64) -> f64 {
    crate::combo_window_ms(grade, true)
        + (cells - 1.0).max(0.0) * crate::combo_window_ms(grade, false)
}
fn rate(list: &[Value]) -> f64 {
    if list.is_empty() {
        0.0
    } else {
        list.iter().filter(|e| truthy(&e["f"])).count() as f64 / list.len() as f64
    }
}
fn speed(list: &[Value], grade: f64) -> f64 {
    let mut xs = list
        .iter()
        .filter(|e| truthy(&e["f"]))
        .map(|e| num(&e["t"]) / base_ms(grade, num(&e["c"])))
        .collect::<Vec<_>>();
    xs.sort_by(f64::total_cmp);
    let n = xs.len();
    if n == 0 {
        f64::INFINITY
    } else if n % 2 == 1 {
        xs[n / 2]
    } else {
        (xs[n / 2 - 1] + xs[n / 2]) / 2.0
    }
}
// Calendar-day arithmetic, equivalent to Date.UTC for persisted YYYY-MM-DD keys.
fn day_number(day: &str) -> Option<i64> {
    let mut parts = day.split('-');
    let mut y = parts.next()?.parse::<i64>().ok()?;
    let m = parts.next()?.parse::<i64>().ok()?;
    let d = parts.next()?.parse::<i64>().ok()?;
    if parts.next().is_some() {
        return None;
    }
    if (0..=99).contains(&y) {
        y += 1900;
    }
    y += (m - 1).div_euclid(12);
    let m = (m - 1).rem_euclid(12) + 1;
    y -= if m <= 2 { 1 } else { 0 };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = m + if m > 2 { -3 } else { 9 };
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    Some(era * 146097 + doe - 719468)
}
fn days_between(a: &Value, b: &Value) -> Option<i64> {
    Some(day_number(b.as_str()?)? - day_number(a.as_str()?)?)
}
fn meets(r: &Value, grade: f64, star: i64) -> bool {
    match star {
        2 => {
            let l = tail(&r["times"], 20);
            l.len() >= 20 && rate(l) >= 0.9
        }
        3 => {
            let l = tail(&r["times"], 10);
            l.len() >= 10
                && l.iter().filter(|e| truthy(&e["f"])).count() >= 5
                && speed(l, grade) <= 1.0
        }
        4 => {
            let since = &r["starDay"]["3"];
            let l = tail(&r["times"], 3);
            truthy(since)
                && l.len() >= 3
                && l.iter().all(|e| {
                    truthy(&e["f"])
                        && truthy(&e["d"])
                        && days_between(since, &e["d"]).is_some_and(|d| d >= 7)
                })
        }
        5 => {
            let l = tail(&r["times"], 20);
            l.len() >= 20 && rate(l) >= 0.95 && speed(l, grade) <= 0.6
        }
        _ => false,
    }
}
fn stars_of(prog: &Value, id: &str) -> f64 {
    let r = &prog["skills"][id];
    num(&r["stars"]).max(if truthy(&r["mastered"]) { 1.0 } else { 0.0 })
}
fn update_stars(r: &mut Value, grade: f64, day: &Value) -> i64 {
    if !truthy(&r["mastered"]) {
        return 0;
    }
    let before = num(&r["stars"]).max(0.0) as i64;
    let mut s = before.max(1);
    if !truthy(&r["starDay"]) {
        r["starDay"] = json!({});
    }
    while s < 5 && meets(r, grade, s + 1) {
        s += 1;
        let key = s.to_string();
        if truthy(day) && !truthy(&r["starDay"][&key]) {
            r["starDay"][&key] = day.clone();
        }
    }
    if truthy(day) && !truthy(&r["starDay"]["1"]) {
        r["starDay"]["1"] = day.clone();
    }
    r["stars"] = json!(s);
    if s > before {
        s
    } else {
        0
    }
}
fn note_timing(r: &mut Value, first_try: bool, info: &Value, at: f64) {
    let t = (num(&info["ms"]) + 0.5).floor().max(0.0);
    let cells = info.get("cells").cloned().unwrap_or(json!(1));
    let misses = info.get("misses").cloned().unwrap_or(json!(0));
    let day = info["day"].clone();
    append_bounded(
        &mut r["times"],
        json!({"t":numeric(t),"c":cells,"f":if first_try {1} else {0},"m":misses,"d":day}),
        TIMES_MAX,
    );
    let days = array(&mut r["days"]);
    if days.last().is_none_or(|g| g["d"] != day) {
        days.push(json!({"d":day,"n":0,"ms":0,"f":0,"c":0}));
    }
    let g = days.last_mut().unwrap();
    g["n"] = numeric(num(&g["n"]) + 1.0);
    g["ms"] = numeric(num(&g["ms"]) + t);
    g["f"] = numeric(num(&g["f"]) + if first_try { 1.0 } else { 0.0 });
    g["c"] = numeric(num(&g["c"]) + num(&cells));
    if days.len() > DAYS_MAX {
        days.drain(..days.len() - DAYS_MAX);
    }
    let first = array(&mut r["first"]);
    if truthy(&info["problem"]) && first.len() < FIRST_MAX {
        first.push(json!({"p":info["problem"],"t":numeric(t),"m":misses,"d":day,"at":numeric(at)}));
    }
}
fn record_result(prog: &mut Value, id: &str, first_try: bool, sig: &Value, info: &Value) -> Value {
    let at = num(&info["at"]);
    let c = catalog();
    let before: HashSet<usize> = (0..c.ids.len())
        .filter(|&i| unlocked_index(prog, i))
        .collect();
    let was_rusty = rusty(prog, at).iter().any(|x| x == id);
    let r = rec(prog, id);
    r["n"] = numeric(num(&r["n"]) + 1.0);
    append_bounded(
        &mut r["hist"],
        json!(if first_try { 1 } else { 0 }),
        MASTERY_WINDOW,
    );
    r["last"] = numeric(at);
    if first_try {
        r["lastOk"] = numeric(at);
    }
    if truthy(sig) {
        append_bounded(&mut r["recent"], sig.clone(), 24);
    }
    if !info["ms"].is_null() && truthy(&info["day"]) {
        note_timing(r, first_try, info, at);
    }
    let was_mastered = truthy(&r["mastered"]);
    if !was_mastered
        && arr(&r["hist"]).len() >= MASTERY_WINDOW
        && arr(&r["hist"]).iter().map(num).sum::<f64>() >= MASTERY_NEED
    {
        r["mastered"] = json!(true);
        r["masteredAt"] = numeric(at);
    }
    let became_mastered = !was_mastered && truthy(&r["mastered"]);
    let grade = c.index.get(id).map(|&i| c.grade[i] as f64).unwrap_or(1.0);
    let stars = update_stars(r, grade, &info["day"]);
    let unlocked: Vec<&str> = (0..c.ids.len())
        .filter(|&i| !before.contains(&i) && unlocked_index(prog, i))
        .map(|i| c.ids[i].as_str())
        .collect();
    json!({"unlocked":unlocked,"mastered":became_mastered,"stars":stars,"polished":was_rusty && first_try})
}
fn dependent_indices(id: &str) -> Vec<usize> {
    let c = catalog();
    let Some(&i) = c.index.get(id) else {
        return vec![];
    };
    let mut marked = HashSet::from([i]);
    for &x in &c.order {
        if c.req[x].iter().any(|p| marked.contains(p)) {
            marked.insert(x);
        }
    }
    c.order
        .iter()
        .copied()
        .filter(|&x| x != i && marked.contains(&x))
        .collect()
}
fn dependent_ids(id: &str) -> Vec<String> {
    dependent_indices(id)
        .into_iter()
        .map(|i| catalog().ids[i].clone())
        .collect()
}
fn relock_targets(prog: &Value, id: &str) -> Vec<String> {
    std::iter::once(id.to_owned())
        .chain(dependent_ids(id))
        .filter(|x| truthy(&prog["skills"][x]))
        .collect()
}
fn relock(prog: &mut Value, id: &str) -> Vec<String> {
    let gone = relock_targets(prog, id);
    if let Some(skills) = prog["skills"].as_object_mut() {
        skills.retain(|k, _| !gone.contains(k));
    }
    gone
}
fn frontier(prog: &Value) -> Vec<String> {
    let c = catalog();
    c.order
        .iter()
        .filter(|&&i| unlocked_index(prog, i) && !mastered(prog, &c.ids[i]))
        .map(|&i| c.ids[i].clone())
        .collect()
}
fn grade_ids(grade: i64) -> Vec<String> {
    let c = catalog();
    let mut indices = (0..c.ids.len())
        .filter(|&i| c.grade[i] == grade)
        .collect::<Vec<_>>();
    indices.sort_by_key(|&i| (c.depth[i], i));
    indices.into_iter().map(|i| c.ids[i].clone()).collect()
}
struct Random<'a> {
    draws: &'a [Value],
    pos: usize,
}
impl<'a> Random<'a> {
    fn new(v: &'a Value) -> Self {
        Self {
            draws: arr(v),
            pos: 0,
        }
    }
    fn next(&mut self) -> f64 {
        let r = self
            .draws
            .get(self.pos)
            .and_then(Value::as_f64)
            .unwrap_or(0.5);
        self.pos += 1;
        if r.is_finite() {
            r.clamp(0.0, 1.0 - f64::EPSILON)
        } else {
            0.5
        }
    }
    fn pick(&mut self, ids: &[String]) -> Value {
        let r = self.next();
        if ids.is_empty() {
            Value::Null
        } else {
            json!(ids[(r * ids.len() as f64).floor() as usize])
        }
    }
}
fn grade_plan(args: &Value) -> Value {
    let grade = args["grade"].as_i64().unwrap_or(1);
    let n = args["n"].as_u64().unwrap_or(0) as usize;
    let list = grade_ids(grade);
    let next = grade_ids((grade + 1).min(6));
    let mut rng = Random::new(&args["random"]);
    let mut basic = Vec::with_capacity(n);
    for i in 0..n {
        let t = if n <= 1 {
            1.0
        } else {
            i as f64 / (n - 1) as f64
        };
        let j = (t * list.len().saturating_sub(1) as f64 + (rng.next() - 0.5) * 1.6 + 0.5).floor();
        basic.push(if list.is_empty() {
            Value::Null
        } else {
            json!(list[(j.max(0.0) as usize).min(list.len() - 1)])
        });
    }
    let hard = &list[(list.len() as f64 * 0.55).floor() as usize..];
    let (extra, cycle) = if grade == 6 {
        (vec![], hard.to_vec())
    } else {
        (
            (0..6)
                .filter_map(|k| {
                    if hard.is_empty() {
                        None
                    } else {
                        Some(hard[k % hard.len()].clone())
                    }
                })
                .collect(),
            next.into_iter().take(4).collect(),
        )
    };
    json!({"mode":"grade","grade":grade,"basic":basic,"extra":extra,"extraCycle":cycle})
}
fn level_plan(args: &Value) -> Value {
    let prog = &args["prog"];
    let n = args["n"].as_u64().unwrap_or(0) as usize;
    if !truthy(&prog["placed"]) {
        let initial = frontier(prog).into_iter().take(1).collect::<Vec<_>>();
        return json!({"mode":"level","placement":true,"walk":{"p":0,"jump":6,"lastOk":-1},"basic":vec![Value::Null;n],"extra":initial,"randomUsed":0});
    }
    let c = catalog();
    let front = frontier(prog);
    let warm = c
        .order
        .iter()
        .filter(|&&i| mastered(prog, &c.ids[i]))
        .map(|&i| c.ids[i].clone())
        .collect::<Vec<_>>();
    let rust = rusty(prog, num(&args["now"]));
    let warm_pick = &warm[warm.len().saturating_sub(6)..];
    let n_warm = warm_pick
        .len()
        .min(((n as f64 * 0.3 + 0.5).floor() as usize).max(1));
    let front_pick = &front[..front.len().min(4)];
    let mut rng = Random::new(&args["random"]);
    let mut basic = vec![];
    for i in 0..n_warm {
        basic.push(if i < rust.len() {
            json!(rust[i])
        } else {
            rng.pick(warm_pick)
        });
    }
    for i in n_warm..n {
        basic.push(if !front_pick.is_empty() {
            json!(front_pick[(i - n_warm) % front_pick.len()])
        } else {
            rng.pick(&warm)
        });
    }
    let hardest = if front.is_empty() { &warm } else { &front };
    json!({"mode":"level","basic":basic,"extra":hardest[hardest.len().saturating_sub(3)..],"randomUsed":rng.pos})
}
fn placement_step(args: &Value) -> Value {
    let mut prog = progress_arg(args);
    let mut walk = if args["walk"].is_object() {
        args["walk"].clone()
    } else {
        json!({"p":0,"jump":6,"lastOk":-1})
    };
    let c = catalog();
    let max_p = c.placement.len().saturating_sub(1) as i64;
    let p = walk["p"].as_i64().unwrap_or(0).clamp(0, max_p);
    let jump = walk["jump"].as_i64().unwrap_or(6).max(1);
    if truthy(&args["firstTry"]) {
        master_ancestors(&mut prog, &c.ids[c.placement[p as usize]], num(&args["at"]));
        walk["lastOk"] = json!(p);
        walk["p"] = json!(max_p.min(p + jump));
        walk["jump"] = json!(12_i64.min((jump as f64 * 1.3).ceil() as i64));
    } else {
        let jump = (jump / 2).max(1);
        let last_ok = walk["lastOk"].as_i64().unwrap_or(-1);
        walk["jump"] = json!(jump);
        walk["p"] = json!(p.min((last_ok + 1).max(p - jump)));
    }
    json!({"walk":walk,"prog":prog})
}
fn pick_capsule(prog: &Value, now: f64) -> Value {
    let Some(skills) = prog["skills"].as_object() else {
        return Value::Null;
    };
    let mut best = Value::Null;
    for (id, r) in skills {
        if !truthy(&r["mastered"]) || !catalog().index.contains_key(id) {
            continue;
        }
        for (i, e) in arr(&r["first"]).iter().enumerate() {
            if truthy(&e["used"])
                || !truthy(&e["p"])
                || !truthy(&e["at"])
                || now - num(&e["at"]) < 30.0 * DAY_MS
            {
                continue;
            }
            if best.is_null() || num(&e["at"]) < num(&best["entry"]["at"]) {
                best = json!({"skill":id,"index":i,"entry":e});
            }
        }
    }
    best
}

// Lifetime statistics and positive growth comparisons (growth.js).
fn empty_stats() -> Value {
    json!({"problems":0,"cells":0,"firstTry":0,"misses":0,
        "plays":0,"modes":{},"perfects":0,"playMs":0,"bestDopaL":0,
        "extras":0,"extraSolved":0,"extraBest":0,"maxCombo":0,"reviewSolved":0,
        "days":0,"lastDay":null,"grades":{},"flags":{}})
}
fn increment(v: &mut Value, key: &str, n: f64) {
    v[key] = numeric(num(&v[key]) + n);
}
fn maximize(v: &mut Value, key: &str, n: f64) {
    v[key] = numeric(num(&v[key]).max(n));
}
fn property_key(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Null => "undefined".to_owned(),
        _ => v.to_string(),
    }
}
fn stats_from_history(history: &Value) -> Value {
    let mut s = empty_stats();
    let mut days: HashSet<String> = HashSet::new();
    for h in arr(history) {
        increment(&mut s, "plays", 1.0);
        increment(&mut s["modes"], &property_key(&h["mode"]), 1.0);
        increment(&mut s, "problems", num(&h["ok"]) + num(&h["extraOk"]));
        increment(&mut s, "misses", num(&h["ng"]) + num(&h["extraNg"]));
        if !h["firstRate"].is_null() {
            let n = if truthy(&h["ok"]) {
                num(&h["ok"])
            } else {
                num(&h["count"])
            };
            increment(&mut s, "firstTry", (num(&h["firstRate"]) * n + 0.5).floor());
        }
        if h["firstRate"].as_f64() == Some(1.0) && h["mode"] != "review" {
            increment(&mut s, "perfects", 1.0);
        }
        if !h["extraOk"].is_null() {
            increment(&mut s, "extras", 1.0);
            increment(&mut s, "extraSolved", num(&h["extraOk"]));
            maximize(&mut s, "extraBest", num(&h["extraOk"]));
        }
        increment(&mut s, "playMs", num(&h["timeMs"]));
        maximize(&mut s, "bestDopaL", num(&h["dopaL"]));
        if h["mode"] == "grade" && truthy(&h["grade"]) {
            increment(&mut s["grades"], &property_key(&h["grade"]), 1.0);
        }
        if truthy(&h["day"]) {
            days.insert(property_key(&h["day"]));
        }
    }
    s["days"] = json!(days.len());
    s["lastDay"] = days
        .into_iter()
        .max()
        .map(Value::String)
        .unwrap_or(Value::Null);
    s
}
fn note_solve(s: &mut Value, info: &Value) {
    increment(s, "problems", 1.0);
    increment(s, "cells", num(&info["cells"]));
    increment(s, "misses", num(&info["misses"]));
    if truthy(&info["firstTry"]) {
        increment(s, "firstTry", 1.0);
    }
    if truthy(&info["review"]) {
        increment(s, "reviewSolved", 1.0);
    }
    if truthy(&info["extra"]) {
        increment(s, "extraSolved", 1.0);
        maximize(s, "extraBest", num(&info["extraSolved"]));
    }
    maximize(s, "maxCombo", num(&info["combo"]));
}
fn note_play(s: &mut Value, info: &Value) {
    if !truthy(&s["grades"]) {
        s["grades"] = json!({});
    }
    if !truthy(&s["flags"]) {
        s["flags"] = json!({});
    }
    let day = &info["day"];
    if truthy(day)
        && truthy(&s["lastDay"])
        && days_between(&s["lastDay"], day).is_some_and(|d| d >= 7)
    {
        s["flags"]["comeback"] = json!(true);
    }
    if info["weekday"].as_f64() == Some(0.0) {
        s["flags"]["sunday"] = json!(true);
    }
    if day.as_str().is_some_and(|d| d.ends_with("-01-01")) {
        s["flags"]["newyear"] = json!(true);
    }
    if info["mode"] == "grade" && truthy(&info["grade"]) {
        increment(&mut s["grades"], &property_key(&info["grade"]), 1.0);
    }
    increment(s, "plays", 1.0);
    increment(&mut s["modes"], &property_key(&info["mode"]), 1.0);
    increment(s, "playMs", num(&info["timeMs"]));
    maximize(s, "bestDopaL", num(&info["dopaL"]));
    if info["firstRate"].as_f64() == Some(1.0) && info["mode"] != "review" {
        increment(s, "perfects", 1.0);
    }
    if truthy(day) && *day != s["lastDay"] {
        increment(s, "days", 1.0);
        s["lastDay"] = day.clone();
    }
}
struct ComparisonRef<'a> {
    kind: &'static str,
    day: &'a Value,
    per_cell: f64,
    rate: f64,
}
fn compare_skill(r: &Value, cur: &Value, today: &Value) -> Value {
    if !truthy(r) || !truthy(cur) || num(&cur["n"]) < 3.0 {
        return Value::Null;
    }
    let per_cell = num(&cur["ms"]) / num(&cur["c"]).max(1.0);
    let cells_now = num(&cur["c"]) / num(&cur["n"]);
    let cur_rate = num(&cur["f"]) / num(&cur["n"]);
    let days = arr(&r["days"])
        .iter()
        .filter(|g| {
            g["d"] != *today
                && num(&g["n"]) >= 3.0
                && days_between(&g["d"], today).is_some_and(|d| d > 0)
        })
        .collect::<Vec<_>>();
    let mut refs = vec![];
    if let Some(g) = days.last() {
        refs.push(ComparisonRef {
            kind: "prev",
            day: &g["d"],
            per_cell: num(&g["ms"]) / num(&g["c"]).max(1.0),
            rate: num(&g["f"]) / num(&g["n"]),
        });
    }
    if let Some(g) = days
        .iter()
        .rev()
        .find(|g| days_between(&g["d"], today).is_some_and(|d| d >= 21))
    {
        if days.last().is_none_or(|prev| !std::ptr::eq(*prev, *g)) {
            refs.push(ComparisonRef {
                kind: "month",
                day: &g["d"],
                per_cell: num(&g["ms"]) / num(&g["c"]).max(1.0),
                rate: num(&g["f"]) / num(&g["n"]),
            });
        }
    }
    let first = arr(&r["first"]);
    if first.len() >= 3
        && truthy(&first[0]["d"])
        && days_between(&first[0]["d"], today).is_some_and(|d| d > 0)
    {
        let cells = first
            .iter()
            .map(|e| {
                if truthy(&e["p"]["steps"]) {
                    arr(&e["p"]["steps"]).len() as f64
                } else {
                    1.0
                }
            })
            .sum::<f64>();
        refs.push(ComparisonRef {
            kind: "first",
            day: &first[0]["d"],
            per_cell: first.iter().map(|e| num(&e["t"])).sum::<f64>() / cells.max(1.0),
            rate: first.iter().filter(|e| !truthy(&e["m"])).count() as f64 / first.len() as f64,
        });
    }
    let mut best = Value::Null;
    for r in refs {
        let faster = (r.per_cell - per_cell) / r.per_cell;
        let surer = cur_rate - r.rate;
        if faster >= 0.1 && (best.is_null() || faster > num(&best["gain"])) {
            best = json!({"kind":r.kind,"d":r.day,"what":"time","from":numeric(r.per_cell*cells_now),"to":numeric(per_cell*cells_now),"gain":numeric(faster)});
        }
        if surer >= 0.1 && (best.is_null() || surer > num(&best["gain"])) {
            best = json!({"kind":r.kind,"d":r.day,"what":"rate","from":numeric(r.rate),"to":numeric(cur_rate),"gain":numeric(surer)});
        }
    }
    best
}
fn growth_lines(args: &Value) -> Value {
    let Some(plays) = args["plays"].as_object() else {
        return json!([]);
    };
    let mut out = vec![];
    for (skill, cur) in plays {
        let comparison = compare_skill(&args["records"][skill], cur, &args["today"]);
        if let Some(comparison) = comparison.as_object() {
            let mut line = json!({"skill":skill});
            object(&mut line).extend(comparison.clone());
            out.push(line);
        }
    }
    out.sort_by(|a, b| num(&b["gain"]).total_cmp(&num(&a["gain"])));
    let max = args["max"].as_i64().unwrap_or(3);
    let count = if max < 0 {
        (out.len() as i64 + max).max(0) as usize
    } else {
        max as usize
    };
    out.truncate(count);
    json!(out)
}
fn capsule_compare(args: &Value) -> Value {
    let then = &args["then"];
    if num(&args["ms"]) < num(&then["t"]) * 0.95 {
        json!({"what":"time","from":then["t"],"to":args["ms"]})
    } else if num(&args["misses"]) < num(&then["m"]) {
        json!({"what":"miss","from":then["m"],"to":args["misses"]})
    } else {
        json!({"what":"none"})
    }
}

/// JSON ABI. Mutating operations return the updated object for the JS adapter
/// to copy back into its existing references. Unknown operations return None.
pub fn dispatch(op: &str, args: &Value) -> Option<Value> {
    let id = args["id"].as_str().unwrap_or("");
    let prog = &args["prog"];
    Some(match op {
        "emptyStats" => empty_stats(),
        "statsFromHistory" => stats_from_history(&args["history"]),
        "noteSolve" | "notePlay" | "noteExtraStart" | "setFlag" | "noteDopa" => {
            let mut s = if args["stats"].is_object() {
                args["stats"].clone()
            } else {
                empty_stats()
            };
            match op {
                "noteSolve" => note_solve(&mut s, &args["info"]),
                "notePlay" => note_play(&mut s, &args["info"]),
                "noteExtraStart" => increment(&mut s, "extras", 1.0),
                "setFlag" => {
                    object(&mut s["flags"]).insert(property_key(&args["name"]), json!(true));
                }
                "noteDopa" => maximize(&mut s, "bestDopaL", num(&args["L"])),
                _ => unreachable!(),
            }
            s
        }
        "daysBetween" => days_between(&args["a"], &args["b"])
            .map(|n| json!(n))
            .unwrap_or(Value::Null),
        "compareSkill" => compare_skill(&args["record"], &args["cur"], &args["today"]),
        "growthLines" => growth_lines(args),
        "capsuleCompare" => capsule_compare(args),
        "emptyProgress" => empty_progress(),
        "isMastered" => json!(mastered(prog, id)),
        "isUnlocked" => json!(unlocked(prog, id)),
        "stateOf" => json!(state_of(prog, id)),
        "masterWithAncestors" => {
            let mut p = progress_arg(args);
            master_ancestors(&mut p, id, num(&args["at"]));
            p
        }
        "recordResult" => {
            let mut p = progress_arg(args);
            let result = record_result(
                &mut p,
                id,
                truthy(&args["firstTry"]),
                &args["sig"],
                &args["info"],
            );
            json!({"prog":p,"result":result})
        }
        "masteryRatio" => numeric(mastery_ratio(prog, id)),
        "skillViews" => skill_views(prog),
        "rustyOf" => json!(rusty(prog, num(&args["now"]))),
        "starsOf" => numeric(stars_of(prog, id)),
        "updateStars" => {
            let mut r = args["record"].clone();
            let result = update_stars(&mut r, num(&args["grade"]), &args["day"]);
            json!({"record":r,"result":result})
        }
        "baseMs" => numeric(base_ms(num(&args["grade"]), num(&args["cells"]))),
        "dependents" => json!(dependent_ids(id)),
        "relockTargets" => json!(relock_targets(prog, id)),
        "relockSkill" => {
            let mut p = progress_arg(args);
            let result = relock(&mut p, id);
            json!({"prog":p,"result":result})
        }
        "frontier" => json!(frontier(prog)),
        "placementStep" => placement_step(args),
        "gradePlan" => grade_plan(args),
        "levelPlan" => level_plan(args),
        "pickCapsule" => pick_capsule(prog, num(&args["now"])),
        "useCapsule" => {
            let mut p = progress_arg(args);
            let skill = args["skill"].as_str().unwrap_or(id);
            let index = args["index"].as_u64().unwrap_or(u64::MAX) as usize;
            let entry = p
                .get_mut("skills")
                .and_then(|s| s.get_mut(skill))
                .and_then(|r| r.get_mut("first"))
                .and_then(Value::as_array_mut)
                .and_then(|a| a.get_mut(index));
            let result = if let Some(e) = entry {
                e["used"] = args["at"].clone();
                true
            } else {
                false
            };
            json!({"prog":p,"result":result})
        }
        "skillOrder" => json!(catalog()
            .order
            .iter()
            .map(|&i| &catalog().ids[i])
            .collect::<Vec<_>>()),
        "placementOrder" => json!(catalog()
            .placement
            .iter()
            .map(|&i| &catalog().ids[i])
            .collect::<Vec<_>>()),
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn call(op: &str, args: Value) -> Value {
        dispatch(op, &args).unwrap()
    }
    fn answer(prog: &mut Value, id: &str, first: bool, info: Value) -> Value {
        record_result(prog, id, first, &Value::Null, &info)
    }
    #[test]
    fn orders_respect_prerequisites() {
        let c = catalog();
        for order in [&c.order, &c.placement] {
            let mut seen = HashSet::new();
            for &i in order {
                assert!(c.req[i].iter().all(|p| seen.contains(p)));
                seen.insert(i);
            }
        }
    }
    #[test]
    fn mastery_requires_five_of_six_and_unlocks_children() {
        let mut p = empty_progress();
        assert_eq!(state_of(&p, "g1-add-c"), "locked");
        let mut result = Value::Null;
        for i in 0..6 {
            result = answer(&mut p, "g1-add-nc", i != 2, json!({"at":1000+i}));
        }
        assert!(mastered(&p, "g1-add-nc"));
        assert!(arr(&result["unlocked"]).contains(&json!("g1-sub-nb")));
        assert!(!unlocked(&p, "g1-add-c"));
        assert_eq!(result["stars"], 1);
        for i in 0..6 {
            answer(&mut p, "g1-compose10", i % 3 != 0, json!({"at":2000+i}));
        }
        assert!(!mastered(&p, "g1-compose10"));
        assert_eq!(
            call("masteryRatio", json!({"prog":p,"id":"g1-compose10"})),
            json!(0.8)
        );
    }
    #[test]
    fn histories_are_bounded_and_first_problems_retained() {
        let mut p = empty_progress();
        for i in 0..75 {
            let day = format!("2026-{:02}-{:02}", 1 + i / 28, 1 + i % 28);
            record_result(
                &mut p,
                "g2-kuku25",
                i % 4 != 0,
                &json!(format!("sig{i}")),
                &json!({"at":1000000+i,"day":day,"ms":2000.4+i as f64,"cells":2,"misses":if i%4==0 {1} else {0},"problem":{"steps":[1,2]}}),
            );
        }
        let r = &p["skills"]["g2-kuku25"];
        assert_eq!(arr(&r["hist"]).len(), 6);
        assert_eq!(arr(&r["recent"]).len(), 24);
        assert_eq!(arr(&r["times"]).len(), 30);
        assert_eq!(r["times"][29]["t"], 2074);
        assert_eq!(arr(&r["days"]).len(), 60);
        assert_eq!(arr(&r["first"]).len(), 3);
        assert_eq!(r["first"][0]["t"], 2000);
        assert_eq!(r["days"][59]["c"], 2);
        answer(&mut p, "g1-add-nc", true, json!({"at":2000000}));
        assert!(p["skills"]["g1-add-nc"]["times"].is_null());
    }
    #[test]
    fn daily_aggregate_accumulates_before_rollover() {
        let mut p = empty_progress();
        for first in [true, false, true] {
            answer(
                &mut p,
                "g1-add-nc",
                first,
                json!({"at":1,"day":"2026-09-30","ms":10.5,"cells":2}),
            );
        }
        assert_eq!(
            p["skills"]["g1-add-nc"]["days"],
            json!([{"d":"2026-09-30","n":3,"ms":33,"f":2,"c":6}])
        );
    }
    #[test]
    fn stars_follow_accuracy_speed_retention_and_never_decrease() {
        let mut p = empty_progress();
        let id = "g2-kuku25";
        let slow = base_ms(2.0, 1.0) * 1.5;
        let normal = base_ms(2.0, 1.0) * 0.9;
        let fast = base_ms(2.0, 1.0) * 0.5;
        for i in 0..20 {
            answer(
                &mut p,
                id,
                i != 9,
                json!({"at":1000+i,"day":"2026-10-01","ms":slow,"cells":1}),
            );
        }
        assert_eq!(stars_of(&p, id), 2.0);
        for _ in 0..10 {
            answer(
                &mut p,
                id,
                true,
                json!({"at":2000,"day":"2026-10-01","ms":normal,"cells":1}),
            );
        }
        assert_eq!(stars_of(&p, id), 3.0);
        assert_eq!(p["skills"][id]["starDay"]["3"], "2026-10-01");
        for _ in 0..3 {
            answer(
                &mut p,
                id,
                true,
                json!({"at":3000,"day":"2026-10-07","ms":normal,"cells":1}),
            );
        }
        assert_eq!(stars_of(&p, id), 3.0);
        for _ in 0..3 {
            answer(
                &mut p,
                id,
                true,
                json!({"at":4000,"day":"2026-10-08","ms":normal,"cells":1}),
            );
        }
        assert_eq!(stars_of(&p, id), 4.0);
        for _ in 0..20 {
            answer(
                &mut p,
                id,
                true,
                json!({"at":5000,"day":"2026-10-08","ms":fast,"cells":1}),
            );
        }
        assert_eq!(stars_of(&p, id), 5.0);
        for _ in 0..30 {
            answer(
                &mut p,
                id,
                false,
                json!({"at":6000,"day":"2026-10-08","ms":slow,"cells":1}),
            );
        }
        assert_eq!(stars_of(&p, id), 5.0);
    }
    #[test]
    fn retention_respects_leap_days_and_month_boundaries() {
        assert_eq!(
            days_between(&json!("2024-02-27"), &json!("2024-03-05")),
            Some(7)
        );
        assert_eq!(
            days_between(&json!("2026-12-29"), &json!("2027-01-05")),
            Some(7)
        );
        assert_eq!(day_number("1970-01-01"), Some(0));
    }
    #[test]
    fn relock_only_removes_dependent_branch() {
        let mut p = empty_progress();
        master_ancestors(&mut p, "g2-kuku-mix", 1000.0);
        master_ancestors(&mut p, "g3-div-basic", 1000.0);
        answer(&mut p, "g3-div-rem", true, json!({"at":2000}));
        answer(&mut p, "g2-frac-of", true, json!({"at":2000}));
        let gone = relock(&mut p, "g2-kuku67");
        assert_eq!(
            gone,
            [
                "g2-kuku67",
                "g2-kuku891",
                "g2-kuku-mix",
                "g3-div-basic",
                "g3-div-rem"
            ]
        );
        assert_eq!(state_of(&p, "g2-kuku67"), "new");
        assert_eq!(state_of(&p, "g3-div-rem"), "locked");
        assert_eq!(state_of(&p, "g2-frac-of"), "learning");
        assert!(mastered(&p, "g1-add-nc"));
        assert!(relock(&mut p, "g2-kuku67").is_empty());
    }
    #[test]
    fn placement_grants_ancestors_and_slips_ease_back() {
        let mut args = json!({"prog":empty_progress(),"walk":{"p":0,"jump":6,"lastOk":-1},"firstTry":true,"at":10000});
        for _ in 0..8 {
            let result = placement_step(&args);
            args["prog"] = result["prog"].clone();
            args["walk"] = result["walk"].clone();
        }
        let count = args["prog"]["skills"]
            .as_object()
            .unwrap()
            .values()
            .filter(|r| truthy(&r["mastered"]))
            .count();
        assert!(count >= 20);
        args["firstTry"] = json!(false);
        let result = placement_step(&args);
        assert!(num(&result["walk"]["p"]) <= num(&args["walk"]["p"]));
        assert_eq!(result["prog"]["skills"]["g1-compose10"]["grantedAt"], 10000);
    }
    #[test]
    fn plans_stay_in_grade_and_use_repeating_extra_descriptors() {
        for grade in 1..=6 {
            let plan = grade_plan(&json!({"grade":grade,"n":10,"random":vec![0.5;10]}));
            assert_eq!(arr(&plan["basic"]).len(), 10);
            for id in arr(&plan["basic"]) {
                assert_eq!(
                    catalog().grade[catalog().index[id.as_str().unwrap()]],
                    grade
                );
            }
            assert_eq!(arr(&plan["extra"]).len(), if grade == 6 { 0 } else { 6 });
            assert!(!arr(&plan["extraCycle"]).is_empty());
        }
        let unplaced = level_plan(&json!({"prog":empty_progress(),"n":10}));
        assert_eq!(unplaced["placement"], true);
        assert_eq!(unplaced["walk"], json!({"p":0,"jump":6,"lastOk":-1}));
    }
    #[test]
    fn oldest_rusty_skills_fill_review_and_first_try_polishes() {
        let now = 1_000_000_000_000.0;
        let mut p = empty_progress();
        p["placed"] = json!(true);
        for (id, age) in [
            ("g1-compose10", 40),
            ("g1-add-nc", 30),
            ("g1-sub-nb", 25),
            ("g1-add-c", 22),
            ("g1-sub-b", 5),
        ] {
            p["skills"][id] = json!({"n":6,"hist":[1,1,1,1,1,1],"mastered":true,"recent":[],"stars":3,"lastOk":numeric(now-age as f64*DAY_MS)});
        }
        assert_eq!(rusty(&p, now), ["g1-compose10", "g1-add-nc", "g1-sub-nb"]);
        let r = answer(&mut p, "g1-compose10", true, json!({"at":now}));
        assert_eq!(r["polished"], true);
        assert_eq!(rusty(&p, now), ["g1-add-nc", "g1-sub-nb", "g1-add-c"]);
        assert_eq!(stars_of(&p, "g1-compose10"), 3.0);
        assert_eq!(
            answer(&mut p, "g1-add-nc", false, json!({"at":now}))["polished"],
            false
        );
        let plan = level_plan(&json!({"prog":p,"n":10,"random":[0.2,0.5,0.8],"now":now}));
        assert_eq!(
            &arr(&plan["basic"])[..3],
            &[json!("g1-add-nc"), json!("g1-sub-nb"), json!("g1-add-c")]
        );
    }
    #[test]
    fn capsules_need_mastery_and_thirty_days_and_skip_used() {
        let mut p = empty_progress();
        let start = 1_000_000_000_000.0;
        for i in 0..6 {
            answer(
                &mut p,
                "g1-add-nc",
                true,
                json!({"at":start+i as f64*1000.0,"day":"2026-08-01","ms":9000,"problem":{"steps":[1]}}),
            );
        }
        assert!(pick_capsule(&p, start + 10.0 * DAY_MS).is_null());
        let c = pick_capsule(&p, start + 30.0 * DAY_MS + 5000.0);
        assert_eq!(c["skill"], "g1-add-nc");
        assert_eq!(c["index"], 0);
        let result = call(
            "useCapsule",
            json!({"prog":p,"skill":"g1-add-nc","index":0,"at":start+31.0*DAY_MS}),
        );
        assert_eq!(result["result"], true);
        assert_eq!(
            pick_capsule(&result["prog"], start + 40.0 * DAY_MS)["index"],
            1
        );
    }
    #[test]
    fn dispatch_preserves_unknown_saved_fields_and_reports_unsupported_ops() {
        let result = call(
            "recordResult",
            json!({"prog":{"placed":false,"skills":{},"review":[1],"future":{"ok":true}},"id":"g1-add-nc","firstTry":true,"info":{"at":42}}),
        );
        assert_eq!(result["prog"]["future"], json!({"ok":true}));
        assert_eq!(result["prog"]["review"], json!([1]));
        assert!(dispatch("unknown", &json!({})).is_none());
    }
    #[test]
    fn legacy_history_seeds_lifetime_statistics() {
        let s = stats_from_history(&json!([
            {"mode":"level","day":"2026-09-25","ok":10,"ng":2,"count":10,"firstRate":0.8,"timeMs":120000,"dopaL":4,"extraOk":6,"extraNg":1},
            {"mode":"grade","grade":2,"day":"2026-09-25","ok":6,"ng":0,"count":6,"firstRate":1,"timeMs":60000,"dopaL":3.2},
            {"mode":"review","day":"2026-09-27","ok":3,"ng":0,"count":3,"firstRate":1,"timeMs":30000,"dopaL":1}
        ]));
        assert_eq!(s["plays"], 3);
        assert_eq!(s["problems"], 25);
        assert_eq!(s["modes"], json!({"level":1,"grade":1,"review":1}));
        assert_eq!(s["misses"], 3);
        assert_eq!(s["firstTry"], 17);
        assert_eq!(s["perfects"], 1);
        assert_eq!(s["extras"], 1);
        assert_eq!(s["extraSolved"], 6);
        assert_eq!(s["extraBest"], 6);
        assert_eq!(s["playMs"], 210000);
        assert_eq!(s["bestDopaL"], 4);
        assert_eq!(s["days"], 2);
        assert_eq!(s["lastDay"], "2026-09-27");
        assert_eq!(s["grades"]["2"], 1);
        assert_eq!(stats_from_history(&Value::Null), empty_stats());
    }
    #[test]
    fn lifetime_mutations_count_days_once_and_record_flags() {
        let mut s = empty_stats();
        note_solve(&mut s, &json!({"cells":3,"firstTry":true,"combo":7}));
        note_solve(
            &mut s,
            &json!({"cells":2,"misses":2,"review":true,"combo":4}),
        );
        s = call("noteExtraStart", json!({"stats":s}));
        note_solve(
            &mut s,
            &json!({"cells":4,"firstTry":true,"extra":true,"extraSolved":1,"combo":12}),
        );
        note_solve(
            &mut s,
            &json!({"cells":4,"firstTry":true,"extra":true,"extraSolved":2}),
        );
        note_play(
            &mut s,
            &json!({"mode":"level","day":"2026-09-27","timeMs":5000,"dopaL":3,"firstRate":1,"weekday":0}),
        );
        note_play(
            &mut s,
            &json!({"mode":"level","day":"2026-09-27","timeMs":5000,"dopaL":2.5,"firstRate":0.5}),
        );
        s = call("noteDopa", json!({"stats":s,"L":5.5}));
        assert_eq!(s["problems"], 4);
        assert_eq!(s["cells"], 13);
        assert_eq!(s["firstTry"], 3);
        assert_eq!(s["misses"], 2);
        assert_eq!(s["reviewSolved"], 1);
        assert_eq!(s["maxCombo"], 12);
        assert_eq!(s["extraSolved"], 2);
        assert_eq!(s["extraBest"], 2);
        assert_eq!(s["days"], 1);
        assert_eq!(s["bestDopaL"], 5.5);
        assert_eq!(s["flags"]["sunday"], true);
        note_play(
            &mut s,
            &json!({"mode":"grade","grade":3,"day":"2027-01-01"}),
        );
        assert_eq!(s["flags"]["comeback"], true);
        assert_eq!(s["flags"]["newyear"], true);
    }
    #[test]
    fn growth_reports_only_the_largest_positive_improvements() {
        let r = json!({"days":[
            {"d":"2026-08-20","n":6,"ms":60000,"f":3,"c":6},
            {"d":"2026-09-26","n":5,"ms":30000,"f":4,"c":5},
            {"d":"2026-09-27","n":4,"ms":12000,"f":4,"c":4}],
            "first":vec![json!({"t":12000,"m":0,"d":"2026-08-01","p":{"steps":[1]}});3]});
        let today = json!("2026-09-27");
        let best = compare_skill(&r, &json!({"n":4,"ms":12000,"c":4,"f":4}), &today);
        assert_eq!(
            best,
            json!({"kind":"first","d":"2026-08-01","what":"time","from":12000,"to":3000,"gain":0.75})
        );
        assert!(compare_skill(&r, &json!({"n":4,"ms":80000,"c":4,"f":1}), &today).is_null());
        assert!(compare_skill(&r, &json!({"n":2,"ms":2000,"c":2,"f":2}), &today).is_null());
        let rate_record = json!({"days":[{"d":"2026-09-26","n":5,"ms":10000,"f":2,"c":5}]});
        let best = compare_skill(&rate_record, &json!({"n":5,"ms":10500,"c":5,"f":5}), &today);
        assert_eq!(best["what"], "rate");
        assert_eq!(best["from"], 0.4);
        assert_eq!(best["to"], 1);
        let lines = growth_lines(
            &json!({"plays":{"a":{"n":4,"ms":12000,"c":4,"f":4},"b":{"n":4,"ms":80000,"c":4,"f":1},"c":{"n":5,"ms":10500,"c":5,"f":5}},"records":{"a":r,"b":r,"c":rate_record},"today":today,"max":1}),
        );
        assert_eq!(arr(&lines).len(), 1);
        assert_eq!(lines[0]["skill"], "a");
    }
    #[test]
    fn capsule_comparison_prefers_speed_then_fewer_slips() {
        assert_eq!(
            capsule_compare(&json!({"then":{"t":9000,"m":2},"ms":3000,"misses":2}))["what"],
            "time"
        );
        assert_eq!(
            capsule_compare(&json!({"then":{"t":3000,"m":2},"ms":4000,"misses":0})),
            json!({"what":"miss","from":2,"to":0})
        );
        assert_eq!(
            capsule_compare(&json!({"then":{"t":3000,"m":0},"ms":4000,"misses":0})),
            json!({"what":"none"})
        );
        let p = empty_progress();
        let unused = call(
            "useCapsule",
            json!({"prog":p,"skill":"missing","index":0,"at":100}),
        );
        assert_eq!(unused["prog"], p);
        assert_eq!(unused["result"], false);
    }
    #[test]
    fn batch_skill_views_match_every_individual_query() {
        for scenario in 0..24 {
            let mut prog = empty_progress();
            for (i, id) in catalog().ids.iter().enumerate() {
                if (i + scenario) % 4 == 0 {
                    continue;
                }
                prog["skills"][id] = json!({
                    "mastered": (i + scenario) % 3 == 0,
                    "n": (i + scenario) % 8,
                    "hist": (0..6).map(|j| u8::from((i + scenario + j) % 3 != 0)).collect::<Vec<_>>(),
                    "stars": (i + scenario) % 7,
                });
            }
            prog["skills"]["removed-skill"] = json!({"mastered":true,"stars":5});
            let before = prog.clone();
            let views = skill_views(&prog);
            assert_eq!(views.as_object().unwrap().len(), 58);
            for id in &catalog().ids {
                let args = json!({"prog":prog,"id":id});
                assert_eq!(views[id]["state"], dispatch("stateOf", &args).unwrap());
                assert_eq!(views[id]["stars"], dispatch("starsOf", &args).unwrap());
                assert_eq!(views[id]["ratio"], dispatch("masteryRatio", &args).unwrap());
            }
            assert_eq!(prog, before);
        }
    }

    #[test]
    fn batch_skill_views_are_fresh_and_previous_snapshots_stay_unchanged() {
        let mut prog = empty_progress();
        let before = skill_views(&prog);
        assert_eq!(
            before["g1-add-nc"],
            json!({"state":"new","stars":0,"ratio":0})
        );
        master_ancestors(&mut prog, "g1-add-nc", 1.0);
        let after = skill_views(&prog);
        assert_eq!(
            after["g1-add-nc"],
            json!({"state":"mastered","stars":1,"ratio":1})
        );
        assert_eq!(after["g1-sub-nb"]["state"], "new");
        assert_eq!(before["g1-sub-nb"]["state"], "locked");
        assert_eq!(before["g1-add-nc"]["state"], "new");
        assert!(!before.as_object().unwrap().contains_key("removed-skill"));
    }
}
