# API Rust/Axum — build multi-stage. Les requêtes sqlx sont en runtime (pas de
# macro nécessitant une base à la compilation) → l'image se build hors-ligne.
# Les migrations sont embarquées dans le binaire via sqlx::migrate!.

FROM rust:1-bookworm AS builder
WORKDIR /app

# Cache des dépendances : on compile d'abord un crate vide.
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs \
    && cargo build --release \
    && rm -rf src

# Build réel.
COPY src ./src
COPY migrations ./migrations
RUN touch src/main.rs && cargo build --release

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libssl3 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/pinkphone-api /usr/local/bin/pinkphone-api
ENV MEDIA_DIR=/data/media \
    BIND_ADDR=0.0.0.0:8080
RUN mkdir -p /data/media
EXPOSE 8080
CMD ["pinkphone-api"]
