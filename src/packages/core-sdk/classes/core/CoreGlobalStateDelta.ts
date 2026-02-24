import { A_GlobalStateDelta } from "../../types";
import { indexerModels } from "algosdk";
import { isUtf8 } from "../../../../utils/isUtf8";

export class CoreGlobalState {
  state: indexerModels.EvalDeltaKeyValue;

  constructor(state: indexerModels.EvalDeltaKeyValue | A_GlobalStateDelta) {
    if (state instanceof indexerModels.EvalDeltaKeyValue) {
      this.state = state;
    } else {
      this.state = CoreGlobalState.fromLegacy(state);
    }
  }

  private static fromLegacy(d: A_GlobalStateDelta): indexerModels.EvalDeltaKeyValue {
    return new indexerModels.EvalDeltaKeyValue({
      key: d.key,
      value: new indexerModels.EvalDelta({
        action: d.value.action,
        bytes: d.value.bytes,
        uint: d.value.uint != null ? BigInt(d.value.uint) : undefined,
      }),
    });
  }

  get(): indexerModels.EvalDeltaKeyValue {
    return this.state;
  }

  getType(): string {
    const action = this.getAction();

    if (action === 1) {
      return "Bytes";
    }
    if (action === 2) {
      return "Uint";
    }
    if (action === 3) {
      if (this.state.value.bytes !== undefined) {
        return "Bytes";
      }
      return "Uint";
    }

    return "";
  }

  getKey(): string {
    const key = Buffer.from(this.state.key, "base64");

    if (isUtf8(key)) {
      return key.toString();
    } else {
      return "0x" + key.toString("hex");
    }
  }

  getAction(): number {
    return Number(this.state.value.action);
  }

  getActionDisplayValue() {
    const action = this.getAction();

    if (action === 1 || action === 2) {
      return "Set";
    }
    if (action === 3) {
      return "Delete";
    }

    return "";
  }

  getActionTypeDisplayValue() {
    return `${this.getActionDisplayValue()} ${this.getType()}`;
  }

  getValue(): string {
    if (this.state.value.bytes !== undefined) {
      return this.state.value.bytes;
    }

    return Number(this.state.value.uint).toString();
  }
}
