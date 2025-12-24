import './Loader.scss';
import {useSelector} from "react-redux";
import {RootState} from "../../../redux/store";
import LoadingTile from '../LoadingTile/LoadingTile';

function Loader(): JSX.Element {
    const loader = useSelector((state: RootState) => state.loader);

  return (
      <div>
          {loader.count ? <div>
              <div className="loading-box">
                  <div className="message">
                      {loader.message}
                  </div>
                  <LoadingTile count={5} />
              </div>
              <div className="loader-wrapper">
              </div>
          </div> : ''}
      </div>
  );
}

export default Loader;
