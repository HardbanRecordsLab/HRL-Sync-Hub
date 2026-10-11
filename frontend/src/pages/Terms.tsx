import LegalSummary from "./LegalSummary";

export default function Terms() {
  return (
    <LegalSummary
      title="Regulamin"
      points={[
        "Panel jest narzędziem zespołu HRL do prowadzenia katalogu i ofert licencji synchronizacyjnych.",
        "Linki ofertowe i publiczna biblioteka służą wyłącznie do odsłuchu. Użycie utworu w filmie, reklamie lub innym materiale wymaga osobnej licencji.",
        "Nie wolno pobierać utworów automatami, obchodzić zabezpieczeń ani udostępniać linków ofertowych dalej bez naszej zgody.",
        "Sprawy licencji: contact@hardbanrecordslab.online; reklamacje i dane osobowe: legal@hardbanrecordslab.online.",
      ]}
    />
  );
}
