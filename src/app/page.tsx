import { PILOT_TICKERS } from "@/data/pilot-tickers";
import { CompanyWorkspace } from "@/components/CompanyWorkspace";

export default function HomePage() {
  // Land directly in the interactive workspace on the flagship pilot ticker (PLTR)
  return <CompanyWorkspace company={PILOT_TICKERS[0]} />;
}
