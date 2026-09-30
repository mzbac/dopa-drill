//! Native release baseline. Includes recipe JSON serialization, excludes JS UI.
use dopa_core::{problems, skills};
use std::hint::black_box;
use std::time::Instant;
fn main() {
    let iterations = 29000_u32;
    let ids = skills()
        .as_array()
        .unwrap()
        .iter()
        .map(|s| s["id"].as_str().unwrap())
        .collect::<Vec<_>>();
    for i in 0..2900 {
        black_box(problems::generate(ids[i as usize % ids.len()], i).unwrap());
    }
    let started = Instant::now();
    let mut bytes = 0;
    for i in 0..iterations {
        let value = problems::generate(ids[i as usize % ids.len()], i).unwrap();
        bytes += black_box(serde_json::to_vec(&value).unwrap()).len();
    }
    let ms = started.elapsed().as_secs_f64() * 1000.0;
    println!("{{\"backend\":\"native-rust-release\",\"iterations\":{iterations},\"totalMs\":{ms:.3},\"microsecondsPerRecipe\":{:.3},\"serializedBytes\":{bytes}}}",ms*1000.0/f64::from(iterations));
}
