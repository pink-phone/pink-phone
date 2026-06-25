//! Codes d'invitation lisibles (#89) — à la place d'un token UUID opaque.
//!
//! Format : **deux mots + `#` + un chiffre**, ex. `EmberVelvet#7`. Le 1er mot
//! vient d'une liste « tendresse / intimité », le 2e d'une liste « matières
//! douillettes » — assez mémorisable pour se dicter à l'oral, assez vaste pour
//! éviter les collisions (≤ 10 invitations actives par salon).
//!
//! La comparaison à la saisie est **insensible à la casse** (cf. `normalize` +
//! l'index `lower(code)` côté SQL). Espace ≈ 32 × 32 × 10 ≈ 10 000 combinaisons.

use rand::Rng;

/// Mots « tendresse / intimité » (1er mot du code).
const WARM: &[&str] = &[
    "Ember", "Spark", "Hush", "Bloom", "Flame", "Glow", "Swoon", "Tease",
    "Blush", "Pulse", "Charm", "Dream", "Honey", "Amber", "Desire", "Cuddle",
    "Kiss", "Caress", "Tender", "Warmth", "Flutter", "Shiver", "Bliss", "Spice",
    "Sultry", "Glimmer", "Twilight", "Moonlit", "Lush", "Sugar", "Whisper", "Crimson",
];

/// Mots « matières douillettes » (2e mot du code).
const COZY: &[&str] = &[
    "Velvet", "Linen", "Cashmere", "Wool", "Felt", "Silk", "Satin", "Suede",
    "Flannel", "Fleece", "Mohair", "Tweed", "Cotton", "Plush", "Chenille", "Velour",
    "Corduroy", "Quilt", "Angora", "Alpaca", "Lace", "Denim", "Canvas", "Jersey",
    "Terry", "Muslin", "Damask", "Brocade", "Boucle", "Cobweb", "Down", "Knit",
];

/// Génère un code d'invitation aléatoire (`MotMot#chiffre`).
pub fn generate() -> String {
    let mut rng = rand::thread_rng();
    let warm = WARM[rng.gen_range(0..WARM.len())];
    let cozy = COZY[rng.gen_range(0..COZY.len())];
    let digit = rng.gen_range(0..10);
    format!("{warm}{cozy}#{digit}")
}

/// Normalise un code saisi pour la comparaison : espaces retirés, minuscules.
/// (Le stockage garde la casse d'origine pour l'affichage ; l'unicité et la
/// recherche se font sur `lower(code)` — cf. la migration `0026`.)
pub fn normalize(input: &str) -> String {
    input.split_whitespace().collect::<String>().to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generate_respecte_le_format() {
        for _ in 0..200 {
            let code = generate();
            let (words, digit) = code.split_once('#').expect("doit contenir #");
            // Le chiffre est un seul caractère 0-9.
            assert_eq!(digit.len(), 1);
            assert!(digit.chars().all(|c| c.is_ascii_digit()));
            // Les deux mots sont capitalisés et alphabétiques.
            assert!(words.chars().all(|c| c.is_ascii_alphabetic()));
            assert!(words.starts_with(|c: char| c.is_ascii_uppercase()));
        }
    }

    #[test]
    fn normalize_insensible_casse_et_espaces() {
        assert_eq!(normalize("EmberVelvet#7"), "embervelvet#7");
        assert_eq!(normalize("  ember velvet #7 "), "embervelvet#7");
        assert_eq!(normalize("EMBERVELVET#7"), "embervelvet#7");
    }
}
