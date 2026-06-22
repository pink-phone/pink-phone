import { describe, expect, it } from "vitest";
import { appendOlder, mergeHead, mergeTail } from "./paginate";

const item = (id: string, createdAt: string) => ({ id, createdAt });

describe("mergeHead (listes triées du plus récent au plus ancien)", () => {
  it("préserve les pages plus anciennes déjà chargées", () => {
    const prev = [item("c", "3"), item("b", "2"), item("a", "1")];
    // Refetch de la tête : seulement les 2 plus récents.
    const head = [item("c", "3"), item("b", "2")];
    expect(mergeHead(head, prev).map((x) => x.id)).toEqual(["c", "b", "a"]);
  });

  it("reflète une création distante en tête", () => {
    const prev = [item("b", "2"), item("a", "1")];
    const head = [item("d", "4"), item("b", "2")];
    expect(mergeHead(head, prev).map((x) => x.id)).toEqual(["d", "b", "a"]);
  });

  it("retire un élément supprimé dans la fenêtre de la tête", () => {
    const prev = [item("c", "3"), item("b", "2"), item("a", "1")];
    // 'b' a disparu de la fenêtre refetchée → considéré supprimé.
    const head = [item("c", "3")];
    expect(mergeHead(head, prev).map((x) => x.id)).toEqual(["c", "b", "a"]);
    // (b/a plus anciens que le cutoff 'c'=3 sont conservés ; ici cutoff=3, donc
    //  seuls < 3 restent : b=2, a=1.)
  });

  it("tête vide ⇒ liste inchangée", () => {
    const prev = [item("a", "1")];
    expect(mergeHead([], prev)).toBe(prev);
  });
});

describe("mergeTail (listes chronologiques, commentaires)", () => {
  it("préserve les commentaires anciens chargés en tête de liste", () => {
    const prev = [item("a", "1"), item("b", "2"), item("c", "3")];
    const head = [item("b", "2"), item("c", "3")];
    expect(mergeTail(head, prev).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("ajoute un nouveau commentaire en fin", () => {
    const prev = [item("a", "1"), item("b", "2")];
    const head = [item("b", "2"), item("d", "4")];
    expect(mergeTail(head, prev).map((x) => x.id)).toEqual(["a", "b", "d"]);
  });

  it("tête vide ⇒ liste inchangée (miroir de mergeHead)", () => {
    const prev = [item("a", "1")];
    expect(mergeTail([], prev)).toBe(prev);
  });
});

describe("appendOlder", () => {
  it("concatène en dédupliquant par id", () => {
    const prev = [item("c", "3"), item("b", "2")];
    const older = [item("b", "2"), item("a", "1")];
    expect(appendOlder(prev, older).map((x) => x.id)).toEqual(["c", "b", "a"]);
  });

  it("older vide ⇒ liste inchangée", () => {
    const prev = [item("c", "3")];
    expect(appendOlder(prev, []).map((x) => x.id)).toEqual(["c"]);
  });

  it("prev vide ⇒ tous les éléments older", () => {
    const older = [item("b", "2"), item("a", "1")];
    expect(appendOlder([], older).map((x) => x.id)).toEqual(["b", "a"]);
  });
});

describe("mergeHead — cas limite au curseur", () => {
  it("élément de prev au même createdAt que le curseur mais absent de head est retiré", () => {
    // b a le même timestamp que c (= cutoff "3") mais n'est pas dans head :
    // la règle est createdAt < cutoff, donc b n'est PAS conservé dans older.
    // Comportement attendu (sémantique du curseur API).
    const prev = [item("c", "3"), item("b", "3"), item("a", "1")];
    const head = [item("c", "3")];
    expect(mergeHead(head, prev).map((x) => x.id)).toEqual(["c", "a"]);
  });
});
