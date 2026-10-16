// Per-route head tags for the SPA (title, description, canonical, robots). Search engines render the page,
// so tags set here are seen. Returns a cleanup that puts the head back the way it was.
export type Seo = { title?: string; description?: string; canonical?: string; robots?: string; jsonLd?: object };

export const SITE = "https://hrl-sync.hub.hardbanrecordslab.online";

function meta(name: string): HTMLMetaElement {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) { el = document.createElement("meta"); el.name = name; document.head.appendChild(el); }
  return el;
}

export function setSeo(s: Seo): () => void {
  const prevTitle = document.title;
  const desc = meta("description"), robots = meta("robots");
  const prevDesc = desc.getAttribute("content"), prevRobots = robots.getAttribute("content");
  const added: HTMLElement[] = [];
  if (s.title) document.title = s.title;
  if (s.description) desc.setAttribute("content", s.description.slice(0, 300));
  robots.setAttribute("content", s.robots || "index, follow");
  if (s.canonical) {
    const link = document.createElement("link");
    link.rel = "canonical"; link.href = s.canonical; link.dataset.seo = "1";
    document.head.appendChild(link); added.push(link);
    for (const [prop, val] of [["og:url", s.canonical], ["og:title", s.title || ""], ["og:description", s.description || ""]] as const) {
      if (!val) continue;
      const og = document.createElement("meta");
      og.setAttribute("property", prop); og.content = val; og.dataset.seo = "1";
      document.head.appendChild(og); added.push(og);
    }
  }
  if (s.jsonLd) {
    const script = document.createElement("script");
    script.type = "application/ld+json"; script.dataset.seo = "1";
    script.textContent = JSON.stringify(s.jsonLd);
    document.head.appendChild(script); added.push(script);
  }
  return () => {
    document.title = prevTitle;
    if (prevDesc !== null) desc.setAttribute("content", prevDesc);
    if (prevRobots !== null) robots.setAttribute("content", prevRobots); else robots.remove();
    added.forEach((el) => el.remove());
  };
}

// Public, indexable pages of the Sync Hub. Everything else (library, pitches, CRM, sales, settings, share links,
// licence receipts) is behind a login or personal to one customer: noindex.
const PUBLIC: Record<string, Seo> = {
  "/": {
    title: "HRL Sync Hub — muzyka do licencjonowania synchronizacyjnego | HardbanRecords Lab",
    description: "HRL Sync Hub to katalog muzyki HardbanRecords Lab do licencjonowania synchronizacyjnego: odsłuchaj utwory, wybierz licencję i użyj muzyki w filmie, reklamie, grze lub podcaście.",
  },
  "/public-library": {
    title: "Biblioteka muzyki do sync licensingu — odsłuchaj i licencjonuj | HRL Sync Hub",
    description: "Przeglądaj i odsłuchuj utwory HardbanRecords Lab: filtruj po gatunku, nastroju i tempie, szukaj po opisie brzmienia i zamów licencję na użycie w filmie, reklamie lub grze.",
  },
  "/partners": {
    title: "Program partnerski HRL Sync Hub — współpraca i licencje muzyczne",
    description: "Dołącz do programu partnerskiego HRL Sync Hub: współpracuj z HardbanRecords Lab przy licencjonowaniu muzyki dla filmu, reklamy i gier.",
  },
  "/terms": {
    title: "Regulamin HRL Sync Hub | HardbanRecords Lab",
    description: "Regulamin korzystania z HRL Sync Hub i zasady licencjonowania muzyki HardbanRecords Lab.",
  },
  "/privacy": {
    title: "Polityka prywatności HRL Sync Hub | HardbanRecords Lab",
    description: "Polityka prywatności HRL Sync Hub: jakie dane przetwarzamy, w jakim celu i jak możesz z nich korzystać.",
  },
};

export function seoForPath(pathname: string, isAuthenticated: boolean): Seo {
  const path = pathname.replace(/\/+$/, "") || "/";
  const page = PUBLIC[path];
  // "/" is the login screen for visitors and the dashboard for logged-in users
  if (!page || (path === "/" && isAuthenticated)) return { robots: "noindex, follow" };
  return { ...page, canonical: SITE + (path === "/" ? "/" : path) };
}
