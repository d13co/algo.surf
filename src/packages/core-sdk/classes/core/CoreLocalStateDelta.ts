import {CoreGlobalState} from "./CoreGlobalStateDelta";


export class CoreLocalState extends CoreGlobalState{
    constructor(state: ConstructorParameters<typeof CoreGlobalState>[0]) {
        super(state);
    }
}
