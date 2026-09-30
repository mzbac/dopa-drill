//! Pure arithmetic, problem generation, scoring and learning state. No DOM,
//! clock, storage or network access. The host supplies seeds and timestamps.
use serde_json::{json, Value};
use std::sync::{Mutex, OnceLock};
pub mod problems;
pub mod progress;
pub mod quests;

pub fn skills() -> &'static Value {
    static SKILLS: OnceLock<Value> = OnceLock::new();
    SKILLS.get_or_init(|| {
        serde_json::from_str(include_str!("skills.json")).expect("valid curriculum")
    })
}

#[no_mangle]
pub extern "C" fn extra_points(k: f64) -> f64 {
    10.0 + 5.0 * k
}
#[no_mangle]
pub extern "C" fn extra_total(n: f64) -> f64 {
    10.0 * n + 5.0 * n * (n - 1.0) / 2.0
}
#[no_mangle]
pub extern "C" fn basic_dopa_l(frac: f64) -> f64 {
    2.3 * frac.clamp(0.0, 1.0).powf(1.15)
}
#[no_mangle]
pub extern "C" fn extra_dopa_l(n: f64) -> f64 {
    2.3 + 3.0 * (1.0 - (-n / 10.0).exp())
}
#[no_mangle]
pub extern "C" fn extra_problem_gain(k: f64) -> f64 {
    extra_dopa_l(k + 1.0) - extra_dopa_l(k)
}
#[no_mangle]
pub extern "C" fn combo_mult(combo: f64) -> f64 {
    1.0 + (combo / 20.0).clamp(0.0, 1.0)
}
#[no_mangle]
pub extern "C" fn add_dopa(l: f64, base: f64, combo: f64) -> f64 {
    (l + base.max(0.003) * combo_mult(combo)).min(9.08)
}
pub fn combo_window_ms(grade: f64, first: bool) -> f64 {
    3000.0
        + 600.0 * ((if grade == 0.0 { 3.0 } else { grade }).clamp(1.0, 6.0) - 1.0)
        + if first { 2500.0 } else { 0.0 }
}
#[no_mangle]
pub extern "C" fn combo_window(grade: f64, first: u32) -> f64 {
    combo_window_ms(grade, first != 0)
}
#[no_mangle]
pub extern "C" fn combo_milestone(c: u32) -> u32 {
    u32::from(matches!(c, 10 | 20 | 30 | 50 | 75) || (c >= 100 && c.is_multiple_of(50)))
}
#[no_mangle]
pub extern "C" fn check_digit(expected: u32, entered: u32) -> u32 {
    u32::from(expected <= 9 && entered <= 9 && expected == entered)
}
#[no_mangle]
pub extern "C" fn gcd(a: u32, b: u32) -> u32 {
    let (mut a, mut b) = (a, b);
    while b != 0 {
        (a, b) = (b, a % b);
    }
    a
}
#[no_mangle]
pub extern "C" fn count_carries(mut a: u32, mut b: u32) -> u32 {
    let (mut carry, mut n) = (0, 0);
    while a > 0 || b > 0 {
        carry = u32::from(a % 10 + b % 10 + carry >= 10);
        n += carry;
        a /= 10;
        b /= 10;
    }
    n
}
#[no_mangle]
pub extern "C" fn count_borrows(mut a: u32, mut b: u32) -> u32 {
    let (mut borrow, mut n) = (0, 0);
    while a > 0 {
        borrow = u32::from((a % 10) as i32 - (b % 10) as i32 - (borrow as i32) < 0);
        n += borrow;
        a /= 10;
        b /= 10;
    }
    n
}

pub fn dispatch(op: &str, args: &Value) -> Result<Value, String> {
    if op == "generate" {
        let id = args["skill"].as_str().ok_or("missing skill")?;
        let seed = args["seed"].as_u64().ok_or("missing seed")? as u32;
        return problems::generate(id, seed);
    }
    if op == "metadata" {
        return Ok(skills().clone());
    }
    progress::dispatch(op, args)
        .or_else(|| quests::dispatch(op, args))
        .ok_or_else(|| format!("unknown operation: {op}"))
}

static OUTPUT: Mutex<Vec<u8>> = Mutex::new(Vec::new());
fn put_result(result: Result<Value, String>) -> *const u8 {
    let response = match result {
        Ok(value) => json!({"ok":true,"value":value}),
        Err(error) => json!({"ok":false,"error":error}),
    };
    let mut output = OUTPUT.lock().expect("single host call");
    *output = serde_json::to_vec(&response).expect("JSON output");
    output.as_ptr()
}
#[no_mangle]
pub extern "C" fn core_output_len() -> usize {
    OUTPUT.lock().expect("single host call").len()
}
#[no_mangle]
pub extern "C" fn core_alloc(len: usize) -> *mut u8 {
    Box::into_raw(vec![0u8; len].into_boxed_slice()) as *mut u8
}
/// # Safety
/// `ptr` must be the live allocation returned by core_alloc with this exact len.
#[no_mangle]
pub unsafe extern "C" fn core_dealloc(ptr: *mut u8, len: usize) {
    if !ptr.is_null() {
        drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len)));
    }
}
/// # Safety
/// `ptr..ptr+len` must reference readable WASM memory allocated by core_alloc.
#[no_mangle]
pub unsafe extern "C" fn core_call(ptr: *const u8, len: usize) -> *const u8 {
    if len > 4_000_000 {
        return put_result(Err("request too large".into()));
    }
    let request = serde_json::from_slice::<Value>(std::slice::from_raw_parts(ptr, len));
    put_result(
        request
            .map_err(|e| e.to_string())
            .and_then(|v| dispatch(v["op"].as_str().unwrap_or(""), &v["args"])),
    )
}
#[no_mangle]
pub extern "C" fn core_generate(skill_index: usize, seed: u32) -> *const u8 {
    let id = skills().get(skill_index).and_then(|s| s["id"].as_str());
    put_result(
        id.ok_or_else(|| "unknown skill index".into())
            .and_then(|id| problems::generate(id, seed)),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn score_boundaries() {
        assert_eq!(extra_total(0.), 0.);
        assert_eq!(extra_total(3.), 45.);
        assert_eq!(basic_dopa_l(-1.), 0.);
        assert_eq!(basic_dopa_l(2.), 2.3);
        assert_eq!(combo_mult(-2.), 1.);
        assert_eq!(combo_mult(30.), 2.);
        assert_eq!(add_dopa(9.079, 1., 50.), 9.08);
        assert_eq!(combo_window_ms(1., true), 5500.);
        assert_eq!(combo_window_ms(6., false), 6000.);
    }
    #[test]
    fn digits_are_validated() {
        assert_eq!(check_digit(3, 3), 1);
        assert_eq!(check_digit(3, 2), 0);
        assert_eq!(check_digit(100, 100), 0);
    }
    #[test]
    fn carry_and_borrow_chains() {
        assert_eq!(count_carries(999, 1), 3);
        assert_eq!(count_borrows(1000, 1), 3);
        assert_eq!(gcd(42, 30), 6);
    }
}
