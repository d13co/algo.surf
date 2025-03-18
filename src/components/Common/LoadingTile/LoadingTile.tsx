import { StringifyOptions } from 'querystring';
import './LoadingTile.scss';
import React from "react";

interface TilesProps {
    count?: number;
    style?: Record<string, string>;
    lineStyle?: Record<string, string>;
}

function LoadingTile({count = 5, style, lineStyle}: TilesProps): JSX.Element {
    return (<div className={"loading-tile-wrapper"}>
        <div className={"loading-tile-container"} style={style}>

            <div className="wrapper">
                <div className="wrapper-cell">
                    <div className="text">
                        {[...Array(count)].map((value, index) => {
                            return <div className="text-line" key={index} style={lineStyle}></div>;
                        })}
                    </div>
                </div>
            </div>


        </div>
    </div>);
}

export default LoadingTile;
