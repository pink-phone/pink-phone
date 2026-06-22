import { useCallback, useEffect, useState } from "react";
import * as api from "../../api/client";
import type { ChallengeSuggestion } from "../../api/types";
import type { Intensity } from "../../domain/types";

export interface SuggestionDraft {
  title: string;
  description: string;
  intensity: Intensity;
}

/**
 * Banque de propositions de défis (globales + propres au salon), dans la langue
 * courante. Domaine autonome : rien d'autre ne lit/écrit ces données (ni le WS
 * ni la resync), d'où une extraction sans couplage.
 */
export function useSuggestions(spaceId: string, lang: string) {
  const [suggestions, setSuggestions] = useState<ChallengeSuggestion[]>([]);

  const reload = useCallback(() => {
    api
      .listChallengeSuggestions(spaceId, lang)
      .then(setSuggestions)
      .catch(() => {});
  }, [spaceId, lang]);

  useEffect(() => {
    reload();
  }, [reload]);

  const add = async (s: SuggestionDraft) => {
    try {
      await api.createSuggestion(spaceId, { ...s, locale: lang });
      reload();
    } catch (e) {
      console.error("ajout de proposition échoué", e);
    }
  };
  const edit = async (id: string, s: SuggestionDraft) => {
    try {
      await api.updateSuggestion(spaceId, id, { ...s, locale: lang });
      reload();
    } catch (e) {
      console.error("édition de proposition échouée", e);
    }
  };
  const remove = async (id: string) => {
    try {
      await api.deleteSuggestion(spaceId, id);
      reload();
    } catch (e) {
      console.error("suppression de proposition échouée", e);
    }
  };
  // Masque / réaffiche une suggestion pour ce salon (#70).
  const setHidden = async (id: string, hidden: boolean) => {
    try {
      await api.setSuggestionHidden(spaceId, id, hidden);
      reload();
    } catch (e) {
      console.error("masquage de proposition échoué", e);
    }
  };

  return { suggestions, add, edit, remove, setHidden };
}
