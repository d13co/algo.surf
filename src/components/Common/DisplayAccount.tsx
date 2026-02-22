import { useReverseNFD } from "./UseNFD";


export function DisplayAccount({ address }: { address: string }) {
  const { data: nfd } = useReverseNFD(address);
  return <span className="truncate">{nfd ? nfd+" " : null}{address}</span>
}
