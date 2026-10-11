import LegalSummary from "./LegalSummary";

export default function Privacy() {
  return (
    <LegalSummary
      title="Polityka prywatności"
      points={[
        "Administrator: Kamil Skomra (HardbanRecords Lab), kontakt w sprawach danych: legal@hardbanrecordslab.online.",
        "Konta zespołu HRL: imię, nazwisko, e-mail, hasło w postaci skrótu, historia działań w panelu.",
        "Kontakty biznesowe (CRM) z branży produkcji filmowej i reklamowej przetwarzamy w ramach prawnie uzasadnionego interesu — możesz w każdej chwili wnieść sprzeciw.",
        "Linki ofertowe zapisują adres IP, czas i odtworzone utwory, żeby ocenić zainteresowanie ofertą (do 12 miesięcy).",
        "Pliki audio leżą w naszym magazynie na serwerze w Niemczech (Contabo); funkcje AI dostają tylko dane katalogowe utworów, bez danych osobowych.",
      ]}
    />
  );
}
