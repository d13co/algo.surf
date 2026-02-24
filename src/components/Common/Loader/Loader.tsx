import { useGlobalUI } from "../../../contexts/GlobalUIContext";
import LoadingTile from "../../v2/LoadingTile";

function Loader(): JSX.Element {
  const { loader } = useGlobalUI();

  if (!loader.count) return <></>;

  return (
    <div>
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[2001] w-[300px] h-[270px] rounded-[15px] shadow-[0_0_10px_rgba(0,0,0,0.15)] text-center pt-5 text-primary">
        <div className="mt-[25px] px-[25px]">{loader.message}</div>
        <LoadingTile count={5} />
      </div>
      <div className="fixed inset-0 bg-[#121212] opacity-80 z-[2000]" />
    </div>
  );
}

export default Loader;
