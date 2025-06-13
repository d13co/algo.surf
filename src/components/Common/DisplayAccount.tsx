import { useReverseNFD } from "./UseNFD";


export function DisplayAccount({ address }: { address: string }) {
  const { data: nfd } = useReverseNFD(address);
  return <>{nfd ? nfd+" " : null}{address}</>
}
