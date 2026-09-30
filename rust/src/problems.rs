//! Deterministic question recipes. Grid geometry and localization belong to JS.
use crate::{count_borrows, count_carries, gcd, skills};
use serde_json::{json, Value};

#[derive(Clone, Copy)]
pub struct Rng {
    pub state: u32,
}
impl Rng {
    pub fn next_f64(&mut self) -> f64 {
        self.state = self.state.wrapping_add(0x6d2b79f5);
        let mut t = (self.state ^ (self.state >> 15)).wrapping_mul(1 | self.state);
        t = t.wrapping_add((t ^ (t >> 7)).wrapping_mul(61 | t)) ^ t;
        f64::from(t ^ (t >> 14)) / 4294967296.0
    }
    fn int(&mut self, a: i64, b: i64) -> i64 {
        a + (self.next_f64() * ((b - a + 1) as f64)).floor() as i64
    }
    fn pick(&mut self, a: &[i64]) -> i64 {
        a[(self.next_f64() * a.len() as f64).floor() as usize]
    }
    fn range(&mut self, v: &Value) -> i64 {
        if let Some(a) = v.as_array() {
            self.int(a[0].as_i64().unwrap(), a[1].as_i64().unwrap())
        } else {
            v.as_i64().unwrap()
        }
    }
    fn ndigit(&mut self, n: i64) -> i64 {
        self.int(10_i64.pow((n - 1) as u32), 10_i64.pow(n as u32) - 1)
    }
}
fn p10(p: i64) -> i64 {
    10_i64.pow(p as u32)
}
fn s(v: &Value, k: &str) -> String {
    v[k].as_str().unwrap_or("").into()
}
fn n(v: &Value, k: &str) -> i64 {
    v[k].as_i64().unwrap_or(0)
}
fn b(v: &Value, k: &str) -> bool {
    v[k].as_bool().unwrap_or(false)
}
fn list(v: &Value, k: &str) -> Vec<i64> {
    v[k].as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_i64().unwrap())
        .collect()
}
fn reduce(n: i64, d: i64) -> (i64, i64) {
    let g = gcd(n as u32, d as u32) as i64;
    (n / g, d / g)
}
fn lcm(a: i64, b: i64) -> i64 {
    a / gcd(a as u32, b as u32) as i64 * b
}
fn dec(n: i64, p: i64) -> String {
    if p == 0 {
        return n.to_string();
    }
    let st = format!("{:0width$}", n, width = (p + 1) as usize);
    let len = st.len();
    format!("{}.{}", &st[..len - p as usize], &st[len - p as usize..])
}
fn table(d: i64, n: i64) -> String {
    let mut v = vec![];
    for k in 1..=9 {
        v.push((d * k).to_string());
        if d * k > n {
            break;
        }
    }
    format!("{d} times table: {}", v.join(" "))
}
fn zero_borrow(a: i64, b: i64) -> bool {
    let aa = a.to_string();
    let bb = format!("{:0width$}", b, width = aa.len());
    (1..aa.len().saturating_sub(1)).any(|i| {
        aa.as_bytes()[i] == b'0'
            && bb.as_bytes()[i] == b'0'
            && aa.as_bytes()[aa.len() - 1] < bb.as_bytes()[bb.len() - 1]
    })
}
fn horizontal(tokens: Value, title: &str, text: String, answer: String, help: String) -> Value {
    json!({"kind":"h","tokens":tokens,"meta":{"title":title,"text":text,"answer":answer,"help":help}})
}
fn column(kind: &str, a: i64, b: i64, pa: i64, pb: i64) -> Value {
    json!({"kind":kind,"a":a,"b":b,"pa":pa,"pb":pb})
}
fn fraction(n: i64, d: i64, mixed: bool) -> (Value, String) {
    let (n, d) = reduce(n, d);
    if mixed && n > d {
        (
            json!({"fa":[n%d,d,n/d]}),
            format!("{} {}/{}", n / d, n % d, d),
        )
    } else {
        (json!({"fa":[n,d]}), format!("{n}/{d}"))
    }
}
fn ft(n: i64, d: i64, w: Option<i64>) -> Value {
    if let Some(w) = w {
        json!({"f":[n,d,w]})
    } else {
        json!({"f":[n,d]})
    }
}

pub fn generate(id: &str, seed: u32) -> Result<Value, String> {
    let sk = skills()
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["id"] == id)
        .ok_or_else(|| format!("unknown skill {id}"))?;
    let name = sk["gen"][0].as_str().unwrap();
    let params = &sk["gen"][1];
    let mut rng = Rng { state: seed };
    let recipe = if name == "vdec" {
        decimal_problem(params, &mut rng)?
    } else {
        generate_inner(name, params, &mut rng)?
    };
    Ok(json!({"recipe":recipe,"seed":rng.state}))
}

fn generate_inner(name: &str, p: &Value, r: &mut Rng) -> Result<Value, String> {
    // Each loop is bounded. Rejections consume exactly the original JS draws.
    let limit = match name {
        "vsub" => 800,
        "vadd" | "vdiv" | "vdec" | "frac" => 600,
        "divTens" | "decDivInt" | "gcdlcm" | "percent" => 200,
        _ => 400,
    };
    for _ in 0..limit {
        match name {
            "compose" => {
                let total = n(p, "total");
                let a = r.int(1, total - 1);
                return Ok(horizontal(
                    json!([{"n":total},{"op":"＝"},{"n":a},{"op":"＋"},{"ans":total-a}]),
                    "Make ten",
                    format!("{total} = {a} + ?"),
                    (total - a).to_string(),
                    format!("What do you add to {a} to make {total}?"),
                ));
            }
            "hadd" | "hsub" => {
                let add = name == "hadd";
                let tens = b(p, "tensToo");
                let (mut x, mut y) = if tens && r.next_f64() < 0.3 {
                    if add {
                        let x = r.int(1, 8) * 10;
                        (x, r.int(1, 9 - x / 10) * 10)
                    } else {
                        let x = r.int(2, 9) * 10;
                        (x, r.int(1, x / 10 - 1) * 10)
                    }
                } else {
                    (r.range(&p["a"]), r.range(&p["b"]))
                };
                if !add && y >= x {
                    continue;
                }
                let c = if add {
                    count_carries(x as u32, y as u32)
                } else {
                    count_borrows(x as u32, y as u32)
                };
                let rule = s(p, if add { "carry" } else { "borrow" });
                if (rule == "none" && c > 0) || (rule == "yes" && c == 0) {
                    continue;
                }
                if add && r.next_f64() < 0.5 && !tens {
                    std::mem::swap(&mut x, &mut y)
                }
                let op = if add { "＋" } else { "−" };
                let ans = if add { x + y } else { x - y };
                let help = if add && rule == "yes" {
                    format!("Add {} to {x} to reach the next ten", 10 - x % 10)
                } else if !add && rule == "yes" {
                    format!("10 − {y} = {}", 10 - y)
                } else {
                    format!("{x} {op} {y}")
                };
                return Ok(horizontal(
                    json!([{"n":x},{"op":op},{"n":y},{"op":"＝"},{"ans":ans}]),
                    if add { "Addition" } else { "Subtraction" },
                    format!("{x} {} {y}", if add { "+" } else { "−" }),
                    ans.to_string(),
                    help,
                ));
            }
            "add3" => {
                let a = r.int(1, 9);
                let b = r.int(1, 9);
                let c = r.int(1, 9);
                let o1 = if r.next_f64() < 0.6 { "＋" } else { "−" };
                let o2 = if r.next_f64() < 0.6 { "＋" } else { "−" };
                let s1 = if o1 == "＋" { a + b } else { a - b };
                if s1 < 0 {
                    continue;
                }
                let ans = if o2 == "＋" { s1 + c } else { s1 - c };
                if !(0..=20).contains(&ans) {
                    continue;
                }
                return Ok(horizontal(
                    json!([{"n":a},{"op":o1},{"n":b},{"op":o2},{"n":c},{"op":"＝"},{"ans":ans}]),
                    "Three numbers",
                    format!("{a}{o1}{b}{o2}{c}"),
                    ans.to_string(),
                    format!("First: {a} {o1} {b} = {s1}"),
                ));
            }
            "kuku" | "mulTens" => {
                let a = if name == "kuku" {
                    r.pick(&list(p, "dans"))
                } else {
                    r.int(1, 9) * 10
                };
                let b = r.int(if name == "kuku" { 1 } else { 2 }, 9);
                let help = if name == "kuku" {
                    table(a, a * (b - 1))
                } else {
                    format!("{} × {b}, then multiply by 10", a / 10)
                };
                return Ok(horizontal(
                    json!([{"n":a},{"op":"×"},{"n":b},{"op":"＝"},{"ans":a*b}]),
                    "Multiplication",
                    format!("{a} × {b}"),
                    (a * b).to_string(),
                    help,
                ));
            }
            "fracOf" => {
                let d = r.pick(&list(p, "dens"));
                let q = r.int(1, 9);
                return Ok(horizontal(
                    json!([{"n":q*d},{"w":"×"},ft(1,d,None),{"op":"＝"},{"ans":q}]),
                    "Fractions",
                    format!("1/{d} of {}", q * d),
                    q.to_string(),
                    format!("Split {} into {d} equal parts", q * d),
                ));
            }
            "div" | "divRem" => {
                let d = r.int(2, 9);
                let q = r.int(1, 9);
                let rem = if name == "divRem" { r.int(1, d - 1) } else { 0 };
                let a = q * d + rem;
                let mut ts =
                    json!([{"n":a},{"op":"÷"},{"n":d},{"op":"＝"},{"ans":q,"label":"Quotient"}]);
                if rem > 0 {
                    ts.as_array_mut()
                        .unwrap()
                        .extend([json!({"w":"R"}), json!({"ans":rem,"label":"Remainder"})]);
                }
                return Ok(horizontal(
                    ts,
                    if rem > 0 {
                        "Division with remainders"
                    } else {
                        "Division"
                    },
                    format!("{a} ÷ {d}"),
                    if rem > 0 {
                        format!("{q} R {rem}")
                    } else {
                        q.to_string()
                    },
                    table(d, a),
                ));
            }
            "divTens" => {
                let d = r.int(2, 9);
                let (a, q, help) = if r.next_f64() < 0.5 {
                    let q = r.int(1, 9);
                    if q * d * 10 > 99 {
                        continue;
                    }
                    (
                        q * d * 10,
                        q * 10,
                        format!("{} ÷ {d}, then multiply by 10", q * d),
                    )
                } else {
                    let t = r.int(1, 4);
                    let o = r.int(1, 4);
                    let a = (t * 10 + o) * d;
                    if a > 99 || (a / 10) % d != 0 || (a % 10) % d != 0 {
                        continue;
                    }
                    (
                        a,
                        a / d,
                        format!("{} ÷ {d} and {} ÷ {d}", a / 10 * 10, a % 10),
                    )
                };
                return Ok(horizontal(
                    json!([{"n":a},{"op":"÷"},{"n":d},{"op":"＝"},{"ans":q}]),
                    "Division",
                    format!("{a} ÷ {d}"),
                    q.to_string(),
                    help,
                ));
            }
            "vadd" => {
                let da = r.range(&p["da"]);
                let a = r.ndigit(da);
                let db = r.range(&p["db"]);
                let b = r.ndigit(db);
                let sum = a + b;
                let c = count_carries(a as u32, b as u32);
                let rule = s(p, "carry");
                if sum.to_string().len() > n(p, "maxDigits") as usize
                    || (rule == "none" && c > 0)
                    || (rule == "some" && c == 0)
                    || (rule == "many" && c < 2)
                {
                    continue;
                }
                return Ok(column("add", a, b, 0, 0));
            }
            "vsub" => {
                let da = r.range(&p["da"]);
                let mut a = r.ndigit(da);
                let db = r.range(&p["db"]);
                let b = r.ndigit(db);
                let rule = s(p, "borrow");
                if rule == "zero" && r.next_f64() < 0.6 {
                    a = a / 100 * 100 + r.int(0, 9)
                }
                if n(p, "aMax") > 0 && a > n(p, "aMax") {
                    continue;
                }
                if b >= a {
                    continue;
                }
                let br = count_borrows(a as u32, b as u32);
                if (rule == "none" && br > 0) || (rule == "some" && br == 0) {
                    continue;
                }
                if rule == "zero" && !(br >= 2 && (zero_borrow(a, b) || r.next_f64() < 0.3)) {
                    continue;
                }
                return Ok(column("sub", a, b, 0, 0));
            }
            "vmul" => {
                let a = r.ndigit(n(p, "da"));
                let b = if n(p, "db") == 1 {
                    r.int(2, 9)
                } else {
                    r.ndigit(n(p, "db"))
                };
                if a % 10 == 0 || (n(p, "db") > 1 && b % 10 == 0) {
                    continue;
                }
                let pa = n(p, "pa");
                let pb = n(p, "pb");
                let prod = a * b;
                if pa + pb > 0 && (prod % 10 == 0 || prod < p10(pa + pb)) {
                    continue;
                }
                return Ok(column("mul", a, b, pa, pb));
            }
            "vdiv" => {
                let d = if n(p, "ds") == 1 {
                    r.int(2, 9)
                } else {
                    r.int(11, 49)
                };
                let a = r.ndigit(n(p, "dd"));
                if a < d * 2 {
                    continue;
                }
                let q = a / d;
                if n(p, "ds") == 2 && n(p, "dd") == 2 && q > 9 {
                    continue;
                }
                if q.to_string().len() < (n(p, "dd") - n(p, "ds")) as usize && r.next_f64() < 0.5 {
                    continue;
                }
                return Ok(column("div", a, d, 0, 0));
            }
            "vdec" => unreachable!("decimal operation selected once outside rejection loop"),
            "decDivInt" => {
                let d = r.int(2, 9);
                let q = r.int(11, 99);
                if q % 10 == 0 {
                    continue;
                }
                let a = q * d;
                if a % 10 == 0 || a > 999 {
                    continue;
                }
                return Ok(horizontal(
                    json!([{"n":dec(a,1)},{"op":"÷"},{"n":d},{"op":"＝"},{"ans":dec(q,1)}]),
                    "Decimal division",
                    format!("{} ÷ {d}", dec(a, 1)),
                    dec(q, 1),
                    format!("Think about {a} ÷ {d}"),
                ));
            }
            "decDivDec" => {
                let d = r.int(2, 9);
                let q = r.int(2, 9);
                let d = if r.next_f64() < 0.5 { d } else { r.int(11, 29) };
                let a = d * q;
                return Ok(horizontal(
                    json!([{"n":dec(a,1)},{"op":"÷"},{"n":dec(d,1)},{"op":"＝"},{"ans":q}]),
                    "Decimal division",
                    format!("{} ÷ {}", dec(a, 1), dec(d, 1)),
                    q.to_string(),
                    format!("The same as {a} ÷ {d}"),
                ));
            }
            "gcdlcm" => {
                let k = r.int(2, 9);
                let a = k * r.int(1, 6);
                let b = k * r.int(1, 6);
                if a == b || a < 4 || b < 4 {
                    continue;
                }
                let is_gcd = s(p, "kind") == "gcd";
                let ans = if is_gcd {
                    gcd(a as u32, b as u32) as i64
                } else {
                    lcm(a, b)
                };
                if ans == 1 || ans > 99 {
                    continue;
                }
                let title = if is_gcd {
                    "Greatest common factor"
                } else {
                    "Least common multiple"
                };
                let label = if is_gcd { "GCF" } else { "LCM" };
                return Ok(horizontal(
                    json!([{"n":a},{"w":"and"},{"n":b},{"br":true},{"w":label},{"op":"＝"},{"ans":ans}]),
                    title,
                    format!("{label} of {a} and {b}"),
                    ans.to_string(),
                    if is_gcd {
                        "The largest number that divides both".into()
                    } else {
                        format!("Look at multiples of {}", a.max(b))
                    },
                ));
            }
            "order" => {
                let a = r.int(2, 9);
                let b = r.int(2, 9);
                let c = r.int(2, 9);
                let form = r.int(0, 3);
                let (mut ts, ans, help, text) = match form {
                    0 => (
                        json!([{"n":a},{"op":"＋"},{"n":b},{"op":"×"},{"n":c}]),
                        a + b * c,
                        format!("First: {b} × {c}"),
                        format!("{a}＋{b}×{c}"),
                    ),
                    1 => (
                        json!([{"n":a},{"op":"×"},{"op":"("},{"n":b},{"op":"＋"},{"n":c},{"op":")"}]),
                        a * (b + c),
                        format!("First: {b} ＋ {c}"),
                        format!("{a}×({b}＋{c})"),
                    ),
                    2 => {
                        if a <= b {
                            continue;
                        }
                        (
                            json!([{"op":"("},{"n":a},{"op":"−"},{"n":b},{"op":")"},{"op":"×"},{"n":c}]),
                            (a - b) * c,
                            format!("First: {a} − {b}"),
                            format!("({a}−{b})×{c}"),
                        )
                    }
                    _ => {
                        let bc = b * c;
                        let x = r.int(bc + 1, bc + 30);
                        (
                            json!([{"n":x},{"op":"−"},{"n":b},{"op":"×"},{"n":c}]),
                            x - bc,
                            format!("First: {b} × {c}"),
                            format!("{x}−{b}×{c}"),
                        )
                    }
                };
                if ans <= 0 || ans > 999 {
                    continue;
                }
                ts.as_array_mut()
                    .unwrap()
                    .extend([json!({"op":"＝"}), json!({"ans":ans})]);
                return Ok(horizontal(
                    ts,
                    "Order of operations",
                    text,
                    ans.to_string(),
                    help,
                ));
            }
            "round" => {
                let a = r.int(1001, 99999);
                let len = a.to_string().len();
                let pl = r.int(1, 3.min(len as i64 - 2));
                let unit = p10(pl);
                let ans = (a + unit / 2) / unit * unit;
                if ans.to_string().len() > len {
                    continue;
                }
                let nm = ["tens", "hundreds", "thousands"][(pl - 1) as usize];
                let lower = ["ones", "tens", "hundreds"][(pl - 1) as usize];
                return Ok(horizontal(
                    json!([{"n":a},{"br":true},{"w":nm},{"op":"→"},{"ans":ans}]),
                    "Rounding",
                    format!("{a} to the nearest {nm}"),
                    ans.to_string(),
                    format!("Look at the {lower} digit; 5 or more rounds up"),
                ));
            }
            "percent" => {
                let a = r.pick(&[20, 40, 50, 60, 80, 100, 200, 300, 400, 500]);
                let p = r.pick(&[5, 10, 20, 25, 30, 40, 50, 60, 75]);
                if a * p % 100 != 0 || a * p == 0 {
                    continue;
                }
                let ans = a * p / 100;
                return Ok(horizontal(
                    json!([{"n":p},{"op":"%"},{"w":"of"},{"n":a},{"op":"＝"},{"ans":ans}]),
                    "Percentages",
                    format!("{p}% of {a}"),
                    ans.to_string(),
                    format!("{a} × {}", p as f64 / 100.0),
                ));
            }
            "ratio" => {
                let a = r.int(1, 9);
                let b = r.int(1, 9);
                if a == b {
                    continue;
                }
                let (x, y) = reduce(a, b);
                let k = r.int(2, 9);
                let left = r.next_f64() < 0.5;
                let ans = if left { x * k } else { y * k };
                let ts = if left {
                    json!([{"n":x},{"op":"："},{"n":y},{"op":"＝"},{"ans":x*k},{"op":"："},{"n":y*k}])
                } else {
                    json!([{"n":x},{"op":"："},{"n":y},{"op":"＝"},{"n":x*k},{"op":"："},{"ans":y*k}])
                };
                return Ok(horizontal(
                    ts,
                    "Equivalent ratios",
                    format!("{x}:{y}"),
                    ans.to_string(),
                    format!("Multiply by {k}"),
                ));
            }
            "letter" => {
                let x = r.int(2, 12);
                let a = r.int(2, 9);
                let form = r.int(0, 2);
                let (mut ts, ans, help, text) = match form {
                    0 => (
                        json!([{"n":"x"},{"op":"×"},{"n":a},{"op":"＝"},{"n":x*a}]),
                        x,
                        format!("{} ÷ {a}", x * a),
                        format!("x×{a}＝{}", x * a),
                    ),
                    1 => (
                        json!([{"n":"x"},{"op":"＋"},{"n":a*3},{"op":"＝"},{"n":x+a*3}]),
                        x,
                        format!("{} − {}", x + a * 3, a * 3),
                        format!("x＋{}＝{}", a * 3, x + a * 3),
                    ),
                    _ => (
                        json!([{"n":"x"},{"op":"−"},{"n":a},{"op":"＝"},{"n":x}]),
                        x + a,
                        format!("{x} ＋ {a}"),
                        format!("x−{a}＝{x}"),
                    ),
                };
                ts.as_array_mut().unwrap().extend([
                    json!({"br":true}),
                    json!({"n":"x"}),
                    json!({"op":"＝"}),
                    json!({"ans":ans}),
                ]);
                return Ok(horizontal(ts, "Find x", text, ans.to_string(), help));
            }
            "frac" => {
                if let Some(v) = fraction_problem(p, r) {
                    return Ok(v);
                }
            }
            _ => return Err(format!("unknown generator: {name}")),
        }
    }
    Err(format!("generation limit reached: {name}"))
}

fn fraction_problem(p: &Value, r: &mut Rng) -> Option<Value> {
    let op = s(p, "op");
    if op == "reduce" {
        let d = r.int(2, 9);
        let n = r.int(1, d - 1);
        let k = r.int(2, 6);
        if gcd(n as u32, d as u32) != 1 {
            return None;
        }
        return Some(horizontal(
            json!([ft(n*k,d*k,None),{"op":"＝"},{"fa":[n,d]}]),
            "Simplify fractions",
            format!("{}/{}, simplify", n * k, d * k),
            format!("{n}/{d}"),
            format!("Divide both by {k}"),
        ));
    }
    if op == "addsub" && b(p, "same") {
        let d = r.int(3, 12);
        let add = r.next_f64() < 0.55;
        let sign = if add { "＋" } else { "−" };
        let txt = if add { "+" } else { "−" };
        if b(p, "mixed") {
            let w1 = r.int(1, 4);
            let w2 = r.int(0, 3);
            let n1 = r.int(1, d - 1);
            let n2 = r.int(1, d - 1);
            let a = w1 * d + n1;
            let bb = w2 * d + n2;
            let res = if add { a + bb } else { a - bb };
            if res <= 0 || res % d == 0 || gcd((res % d) as u32, d as u32) != 1 {
                return None;
            }
            let fa = if res / d > 0 {
                json!({"fa":[res%d,d,res/d]})
            } else {
                json!({"fa":[res%d,d]})
            };
            return Some(horizontal(
                json!([ft(n1,d,Some(w1)),{"op":sign},ft(n2,d,if w2>0{Some(w2)}else{None}),{"op":"＝"},fa]),
                "Add and subtract fractions",
                format!("{w1} {n1}/{d} {txt} {w2} {n2}/{d}"),
                if res >= d {
                    format!("{} {}/{}", res / d, res % d, d)
                } else {
                    format!("{res}/{d}")
                },
                format!("Keep the denominator {d}"),
            ));
        }
        let n1 = r.int(1, d - 1);
        let n2 = r.int(1, d - 1);
        let res = if add { n1 + n2 } else { n1 - n2 };
        if res <= 0 || (b(p, "maxOne") && res >= d) {
            return None;
        }
        return Some(horizontal(
            json!([ft(n1,d,None),{"op":sign},ft(n2,d,None),{"op":"＝"},{"fa":[res,d]}]),
            "Add and subtract fractions",
            format!("{n1}/{d} {txt} {n2}/{d}"),
            format!("{res}/{d}"),
            format!("Keep the denominator {d}"),
        ));
    }
    if op == "addsub" {
        let d1 = r.int(2, 9);
        let d2 = r.int(2, 9);
        if d1 == d2 {
            return None;
        }
        let n1 = r.int(1, d1 - 1);
        let n2 = r.int(1, d2 - 1);
        if gcd(n1 as u32, d1 as u32) != 1 || gcd(n2 as u32, d2 as u32) != 1 {
            return None;
        }
        let add = r.next_f64() < 0.55;
        let l = lcm(d1, d2);
        if l > 36 {
            return None;
        }
        let res = if add {
            n1 * (l / d1) + n2 * (l / d2)
        } else {
            n1 * (l / d1) - n2 * (l / d2)
        };
        if res <= 0 || res >= l {
            return None;
        }
        let (rn, rd) = reduce(res, l);
        return Some(horizontal(
            json!([ft(n1,d1,None),{"op":if add{"＋"}else{"−"}},ft(n2,d2,None),{"op":"＝"},{"fa":[rn,rd]}]),
            "Add and subtract fractions",
            format!("{n1}/{d1} {} {n2}/{d2}", if add { "+" } else { "−" }),
            format!("{rn}/{rd}"),
            format!("Use common denominator {l}"),
        ));
    }
    if op == "muldivInt" {
        let d = r.int(2, 9);
        let n = r.int(1, d - 1);
        let k = r.int(2, 9);
        if gcd(n as u32, d as u32) != 1 {
            return None;
        }
        let mul = r.next_f64() < 0.5;
        let (rn, rd) = if mul {
            reduce(n * k, d)
        } else {
            reduce(n, d * k)
        };
        if rd == 1 {
            return None;
        }
        let (fa, answer) = fraction(rn, rd, true);
        let sign = if mul { "×" } else { "÷" };
        return Some(horizontal(
            json!([ft(n,d,None),{"op":sign},{"n":k},{"op":"＝"},fa]),
            "Fractions and whole numbers",
            format!("{n}/{d} {sign} {k}"),
            answer,
            format!(
                "Multiply the {} by {k}",
                if mul { "numerator" } else { "denominator" }
            ),
        ));
    }
    if op == "mul" || op == "div" {
        let d1 = r.int(2, 9);
        let n1 = r.int(1, 9);
        let d2 = r.int(2, 9);
        let n2 = r.int(1, 9);
        if gcd(n1 as u32, d1 as u32) != 1 || gcd(n2 as u32, d2 as u32) != 1 || n1 == d1 || n2 == d2
        {
            return None;
        }
        let (rn, rd) = if op == "mul" {
            reduce(n1 * n2, d1 * d2)
        } else {
            reduce(n1 * d2, d1 * n2)
        };
        if rd == 1 || rn > 99 || rd > 99 {
            return None;
        }
        let (fa, answer) = fraction(rn, rd, true);
        let sign = if op == "mul" { "×" } else { "÷" };
        return Some(horizontal(
            json!([ft(n1,d1,None),{"op":sign},ft(n2,d2,None),{"op":"＝"},fa]),
            if op == "mul" {
                "Multiply fractions"
            } else {
                "Divide fractions"
            },
            format!("{n1}/{d1} {sign} {n2}/{d2}"),
            answer,
            if op == "mul" {
                "Multiply numerators and denominators".into()
            } else {
                format!("Flip {n2}/{d2}, then multiply")
            },
        ));
    }
    if op == "decimal" {
        let t = r.pick(&[2, 4, 5, 6, 8]);
        let d = r.int(2, 9);
        let n = r.int(1, d - 1);
        if gcd(n as u32, d as u32) != 1 {
            return None;
        }
        let (rn, rd) = reduce(t * n, 10 * d);
        if rd == 1 || rn > 99 || rd > 99 {
            return None;
        }
        return Some(horizontal(
            json!([{"n":dec(t,1)},{"op":"×"},ft(n,d,None),{"op":"＝"},{"fa":[rn,rd]}]),
            "Decimals and fractions",
            format!("{} × {n}/{d}", dec(t, 1)),
            format!("{rn}/{rd}"),
            format!("{} = {t}/10", dec(t, 1)),
        ));
    }
    None
}

fn decimal_problem(p: &Value, r: &mut Rng) -> Result<Value, String> {
    let op = s(p, "op");
    let add = if op == "addsub" {
        r.next_f64() < 0.5
    } else {
        op == "add"
    };
    for _ in 0..600 {
        let pa = n(p, "places");
        let pb = if pa == 2 && r.next_f64() < 0.4 { 1 } else { pa };
        let a = r.int(p10(pa) + 1, p10(pa + 1) * 3 - 1);
        let b = r.int(1, p10(pb + 1) * 2 - 1);
        if a % 10 == 0 || b % 10 == 0 {
            continue;
        }
        let pp = pa.max(pb);
        let aa = a * p10(pp - pa);
        let bb = b * p10(pp - pb);
        if add {
            if (aa + bb) % 10 == 0 {
                continue;
            }
            return Ok(column("add", a, b, pa, pb));
        }
        if aa <= bb || (aa - bb) % 10 == 0 || pb > pa {
            continue;
        }
        return Ok(column("sub", a, b, pa, pb));
    }
    Err("generation limit reached: vdec".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn deterministic_rng() {
        let mut r = Rng { state: 2026 };
        let a = (0..100).map(|_| r.next_f64()).collect::<Vec<_>>();
        let mut r = Rng { state: 2026 };
        assert_eq!(a, (0..100).map(|_| r.next_f64()).collect::<Vec<_>>());
        assert!(a.iter().all(|v| *v >= 0.0 && *v < 1.0));
    }
    #[test]
    fn all_58_skills_generate() {
        assert_eq!(skills().as_array().unwrap().len(), 58);
        for sk in skills().as_array().unwrap() {
            let id = sk["id"].as_str().unwrap();
            for seed in 0..250 {
                let out = generate(id, seed).unwrap_or_else(|e| panic!("{id} {seed}: {e}"));
                assert!(out["recipe"]["kind"].is_string());
                assert!(out["seed"].is_u64());
                assert_eq!(out, generate(id, seed).unwrap());
            }
        }
    }
    #[test]
    fn unknown_skill_errors() {
        assert!(generate("missing", 0).is_err());
    }
    #[test]
    fn decimals_are_exact() {
        assert_eq!(dec(5, 2), "0.05");
        assert_eq!(dec(1234, 2), "12.34");
        assert_eq!(reduce(12, 18), (2, 3));
    }
}
