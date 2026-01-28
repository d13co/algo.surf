import { OpenInFlow } from "./OpenInFlow";
import { OpenInLora } from "./OpenInLora";
import { OpenInPera } from "./OpenInPera";

export const OpenInRegistry = {
    Lora: new OpenInLora(),
    Pera: new OpenInPera(),
    Flow: new OpenInFlow(),
}