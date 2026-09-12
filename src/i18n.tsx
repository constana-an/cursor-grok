import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_LANG, loadLang, localeOf, saveLang, translate, type Lang, type TKey, type TVars } from "./lib/i18n";

/**
 * The language the whole shop reads in.
 *
 * It lives here rather than in `src/lib/` because that folder is deliberately
 * framework-free — the dictionary and the formatters are pure and unit-testable
 * there, and this file is the only React part. It is not in `Prototype.tsx`
 * either: the screens need `useI18n`, and importing it from their own parent
 * would make the module graph circular.
 *
 * The choice is per device, not per couple: two people can read the same shop in
 * two different languages, which is the whole point of having the switch.
 */
type I18nValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TKey, vars?: TVars) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      return loadLang();
    } catch {
      return DEFAULT_LANG;
    }
  });

  const setLang = useCallback((next: Lang) => {
    saveLang(next);
    setLangState(next);
  }, []);

  // Screen readers, hyphenation and font fallback all read this, so it has to
  // follow the switch rather than stay at whatever index.html was built with.
  useEffect(() => {
    document.documentElement.lang = localeOf(lang);
  }, [lang]);

  const value = useMemo<I18nValue>(
    () => ({ lang, setLang, t: (key, vars) => translate(lang, key, vars) }),
    [lang, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside <LanguageProvider>");
  return value;
}
