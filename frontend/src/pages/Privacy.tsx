function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-3">{n}. {title}</h2>
      <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Polityka prywatności — HRL Sync</h1>
        <p className="text-xs text-muted-foreground mb-10">Ostatnia aktualizacja: 23 września 2026 r.</p>

        <Section n="1" title="Administrator danych">
          <p>
            Administratorem danych osobowych jest [DANE PODMIOTU: Kamil Skomra, prowadzący
            jednoosobową działalność gospodarczą pod firmą HardbanRecords Lab, NIP: [NIP], REGON:
            [REGON], adres siedziby: [ADRES]]. Kontakt: contact@hardbanrecordslab.online.
          </p>
        </Section>

        <Section n="2" title="Jakie dane przetwarzamy">
          <p>
            <b>Zespół HRL (konta w panelu):</b> imię, nazwisko, adres e-mail, hasło (zahaszowane),
            historia logowań i działań w panelu.
          </p>
          <p>
            <b>Kontakty biznesowe (CRM):</b> imię i nazwisko, firma/produkcja, adres e-mail, notatki
            dotyczące relacji biznesowej — wprowadzane przez zespół HRL w związku z kontaktami
            sync-licencyjnymi (nawiązanymi np. na targach, przez pocztę e-mail, rekomendacje).
          </p>
          <p>
            <b>Odbiorcy linków pitchowych i publicznej biblioteki:</b> adres IP, znacznik czasu i
            zdarzenia odtwarzania (który utwór, kiedy, ile razy) — zbierane w celu oceny
            zainteresowania konkretnym utworem przez klienta, do którego link został wysłany.
          </p>
        </Section>

        <Section n="3" title="Cel i podstawa prawna">
          <p>
            Dane zespołu przetwarzane są w celu umożliwienia dostępu do panelu (wykonanie umowy o
            współpracę / prawnie uzasadniony interes administratora). Dane kontaktów biznesowych
            przetwarzane są na podstawie prawnie uzasadnionego interesu administratora (art. 6 ust. 1
            lit. f RODO) — prowadzenie relacji B2B z podmiotami z branży produkcji filmowej/reklamowej.
            Dane odtworzeń przetwarzane są w tym samym celu — ocena zainteresowania ofertą przed
            ewentualnym zawarciem umowy licencyjnej.
          </p>
        </Section>

        <Section n="4" title="Twoje prawa">
          <p>
            Jeśli Twoje dane kontaktowe znajdują się w naszym CRM w związku z relacją biznesową,
            przysługuje Ci prawo dostępu do nich, sprostowania, usunięcia, ograniczenia przetwarzania
            oraz sprzeciwu — skontaktuj się pod adresem contact@hardbanrecordslab.online. Przysługuje
            Ci również prawo wniesienia skargi do Prezesa Urzędu Ochrony Danych Osobowych.
          </p>
        </Section>

        <Section n="5" title="Odbiorcy danych">
          <p>
            Dane hostowane są na infrastrukturze serwerowej administratora. Pliki audio przechowywane
            są w magazynie obiektowym (MinIO/S3) należącym do administratora — nie są udostępniane
            zewnętrznym platformom streamingowym.
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
