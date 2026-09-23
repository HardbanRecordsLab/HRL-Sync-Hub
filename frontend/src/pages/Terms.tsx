function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-3">{n}. {title}</h2>
      <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}

export default function Terms() {
  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Regulamin — HRL Sync</h1>
        <p className="text-xs text-muted-foreground mb-10">Ostatnia aktualizacja: 23 września 2026 r.</p>

        <Section n="1" title="Charakter usługi">
          <p>
            HRL Sync jest prywatną biblioteką sync-licencyjną prowadzoną przez podmiot [DANE PODMIOTU:
            Kamil Skomra, prowadzący jednoosobową działalność gospodarczą pod firmą HardbanRecords Lab,
            NIP: [NIP], REGON: [REGON], adres siedziby: [ADRES]] (dalej: „HRL"), przeznaczoną do
            prezentacji katalogu utworów muzycznych klientom sync-licencyjnym (produkcje filmowe,
            reklamowe, telewizyjne) oraz do wewnętrznego zarządzania tym katalogiem przez zespół HRL.
          </p>
          <p>
            Dostęp do panelu zarządzania katalogiem mają wyłącznie osoby, którym konto zostało
            utworzone bezpośrednio przez administratora HRL — platforma nie prowadzi publicznej
            rejestracji użytkowników.
          </p>
        </Section>

        <Section n="2" title="Publiczna biblioteka i linki pitchowe">
          <p>
            HRL może udostępniać część katalogu w formie publicznej biblioteki podglądowej lub
            spersonalizowanego linku do playlisty (link pitchowy), przesyłanego bezpośrednio
            potencjalnemu klientowi sync-licencyjnemu w celu zapoznania się z utworami.
          </p>
          <p className="font-medium text-foreground">
            Odsłuchanie utworu za pośrednictwem publicznej biblioteki lub linku pitchowego <b>nie
            stanowi udzielenia jakiejkolwiek licencji</b> na wykorzystanie utworu w żadnym projekcie,
            produkcji ani publikacji. Wykorzystanie utworu w konkretnym projekcie wymaga odrębnej,
            pisemnej umowy sync-licencyjnej zawartej z HRL, określającej zakres, terytorium, czas
            trwania i wynagrodzenie.
          </p>
          <p>
            Pobieranie, kopiowanie, redystrybucja lub udostępnianie osobom trzecim plików audio
            udostępnionych w bibliotece publicznej lub przez link pitchowy, poza celem oceny utworu
            przed ewentualnym zawarciem umowy licencyjnej, jest zabronione.
          </p>
        </Section>

        <Section n="3" title="Konta zespołu">
          <p>
            Osoby korzystające z panelu zarządzania katalogiem na podstawie konta utworzonego przez
            administratora są odpowiedzialne za poufność swoich danych logowania oraz za wszystkie
            działania wykonane z ich konta. Konto może zostać zablokowane przez administratora w
            dowolnym momencie, w szczególności przy zakończeniu współpracy z HRL.
          </p>
        </Section>

        <Section n="4" title="Postanowienia końcowe">
          <p>
            W sprawach nieuregulowanych niniejszym regulaminem zastosowanie mają przepisy prawa
            polskiego. Kontakt: contact@hardbanrecordslab.online.
          </p>
        </Section>

        <p className="text-xs text-muted-foreground/60 mt-12">
          Niniejszy dokument ma charakter informacyjny. Przed szerszym publicznym udostępnieniem
          katalogu zalecana jest konsultacja z prawnikiem, w szczególności co do uzupełnienia danych
          podmiotu.
        </p>
      </div>
    </div>
  );
}
