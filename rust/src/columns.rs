//! Arithmetic models for written calculations. JS only assigns grid positions.
use serde_json::{json, Value};
fn dec(n: i64, p: usize) -> String {
    if p == 0 {
        return n.to_string();
    }
    let s = format!("{:0width$}", n, width = p + 1);
    let cut = s.len() - p;
    format!("{}.{}", &s[..cut], &s[cut..])
}
fn text_digits(n: i64, p: usize) -> Vec<String> {
    format!("{:0width$}", n, width = p + 1)
        .chars()
        .map(|c| c.to_string())
        .collect()
}
fn digits(n: i64) -> Vec<i64> {
    n.to_string().bytes().map(|c| i64::from(c - b'0')).collect()
}
fn digit_at(n: i64, i: usize) -> i64 {
    n / 10_i64.pow(i as u32) % 10
}
pub fn model(kind: &str, a: i64, b: i64, pa: usize, pb: usize) -> Result<Value, String> {
    if a < 0 || b < 0 || a > 1_000_000 || b > 1_000_000 || pa > 3 || pb > 3 {
        return Err("column operands out of range".into());
    }
    match kind {
        "add" | "sub" => {
            let p = pa.max(pb);
            let aa = a * 10_i64.pow((p - pa) as u32);
            let bb = b * 10_i64.pow((p - pb) as u32);
            let res = if kind == "add" { aa + bb } else { aa - bb };
            if res < 0 {
                return Err("negative column subtraction".into());
            }
            let ad = text_digits(aa, p);
            let bd = text_digits(bb, p);
            let result = text_digits(res, p);
            let mut steps = vec![];
            if kind == "add" {
                let mut carry = 0;
                for i in 0..result.len() {
                    let x = digit_at(aa, i);
                    let y = digit_at(bb, i);
                    let carry_in = carry;
                    carry = i64::from(x + y + carry >= 10);
                    let mut terms = vec![];
                    if i < ad.len() && i >= p - pa {
                        terms.push(x)
                    }
                    if i < bd.len() && i >= p - pb {
                        terms.push(y)
                    }
                    steps.push(json!({"digit":result[result.len()-1-i],"carry":carry,"carryIn":carry_in,"terms":terms}));
                }
            } else {
                let mut cur = vec![0];
                cur.extend(ad.iter().map(|d| d.parse::<i64>().unwrap()));
                let cols = ad.len() + 1;
                for i in 0..result.len() {
                    let c = cols - 1 - i;
                    let sub = digit_at(bb, i);
                    let mut marks = vec![];
                    if cur[c] < sub {
                        let mut k = c - 1;
                        while cur[k] == 0 {
                            cur[k] = 9;
                            marks.push(json!({"c":k,"text":"9"}));
                            if k == 0 {
                                return Err("invalid borrow chain".into());
                            }
                            k -= 1
                        }
                        cur[k] -= 1;
                        marks.push(json!({"c":k,"text":cur[k].to_string()}));
                        cur[c] += 10;
                        marks.push(json!({"c":c,"text":cur[c].to_string()}));
                    }
                    steps.push(json!({"digit":result[result.len()-1-i],"marks":marks,"minuend":cur[c],"subtrahend":sub}));
                }
            }
            Ok(json!({"P":p,"as":ad,"bs":bd,"result":result,"answer":dec(res,p),"steps":steps}))
        }
        "mul" => {
            let prod = a * b;
            let ad = digits(a);
            let mut bd = digits(b);
            bd.reverse();
            let mut partials = vec![];
            for factor in &bd {
                let part = a * factor;
                let ds = part.to_string();
                let mut carry = 0;
                let mut steps = vec![];
                for (i, ch) in ds.chars().rev().enumerate() {
                    let x = if i < ad.len() {
                        Some(ad[ad.len() - 1 - i])
                    } else {
                        None
                    };
                    steps.push(json!({"digit":ch.to_string(),"x":x,"carry":carry}));
                    carry = x.map(|x| (x * factor + carry) / 10).unwrap_or(0);
                }
                partials.push(json!({"factor":factor,"steps":steps}));
            }
            let mut sums = vec![];
            if bd.len() > 1 {
                let p1 = a * bd[0];
                let p2 = a * bd[1] * 10;
                let mut carry = 0;
                for (i, ch) in prod.to_string().chars().rev().enumerate() {
                    let x = digit_at(p1, i);
                    let y = if i > 0 { digit_at(p2, i) } else { 0 };
                    sums.push(json!({"digit":ch.to_string(),"x":x,"y":y,"carry":carry}));
                    carry = (x + y + carry) / 10;
                }
            }
            Ok(
                json!({"as":a.to_string(),"bs":b.to_string(),"ps":prod.to_string(),"P":pa+pb,"answer":dec(prod,pa+pb),"partials":partials,"sums":sums}),
            )
        }
        "div" => {
            if b == 0 {
                return Err("division by zero".into());
            }
            let ds = a.to_string();
            let mut k = 1;
            while ds[..k].parse::<i64>().unwrap() < b && k < ds.len() {
                k += 1
            }
            let first = k;
            let mut cur = ds[..k].parse::<i64>().unwrap();
            let mut stages = vec![];
            loop {
                let qd = cur / b;
                let product = qd * b;
                let rem = cur - product;
                let mut multiples = vec![];
                for f in 1..=9 {
                    multiples.push(b * f);
                    if b * f > cur {
                        break;
                    }
                }
                stages.push(json!({"current":cur,"quotientDigit":qd,"product":product,"remainder":rem,"multiples":multiples}));
                if k == ds.len() {
                    break;
                }
                cur = rem * 10 + i64::from(ds.as_bytes()[k] - b'0');
                k += 1;
            }
            Ok(json!({"quotient":a/b,"remainder":a%b,"firstDigits":first,"stages":stages}))
        }
        _ => Err(format!("unknown column model {kind}")),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn borrow_across_zero() {
        let m = model("sub", 503, 278, 0, 0).unwrap();
        assert_eq!(m["answer"], "225");
        assert_eq!(
            m["steps"][0]["marks"],
            json!([{"c":2,"text":"9"},{"c":1,"text":"4"},{"c":3,"text":"13"}])
        )
    }
    #[test]
    fn long_division_intermediates() {
        let m = model("div", 156, 4, 0, 0).unwrap();
        assert_eq!(m["quotient"], 39);
        assert_eq!(m["stages"][0]["remainder"], 3);
        assert_eq!(m["stages"][1]["current"], 36)
    }
    #[test]
    fn decimal_model() {
        assert_eq!(model("add", 123, 45, 2, 1).unwrap()["answer"], "5.73");
        assert_eq!(model("mul", 12, 13, 1, 1).unwrap()["answer"], "1.56")
    }
    #[test]
    fn invalid_inputs_rejected() {
        assert!(model("div", 5, 0, 0, 0).is_err());
        assert!(model("sub", 1, 2, 0, 0).is_err())
    }
}
