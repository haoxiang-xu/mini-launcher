import { ConfigContext } from "@mini-ui/CONTAINERs/config/context.js";
import defaults from "@mini-ui/BUILTIN_COMPONENTs/theme/default_mini_theme.json";
import Scrollable from "@mini-ui/BUILTIN_COMPONENTs/class/scrollable.js";
export { default as Button } from "@mini-ui/BUILTIN_COMPONENTs/input/button.js";
export { default as Tooltip } from "@mini-ui/BUILTIN_COMPONENTs/tooltip/tooltip.js";
export { default as Modal } from "@mini-ui/BUILTIN_COMPONENTs/modal/modal.js";
export { default as Select } from "@mini-ui/BUILTIN_COMPONENTs/select/select.js";

const base = defaults.dark_mode;
const font = '"Nunito Sans", "Microsoft YaHei", system-ui, sans-serif';
const theme = {
  ...base,
  font: { ...base.font, fontFamily: font },
  input: { ...base.input, backgroundColor: '#101010' },
  textfield: { ...base.textfield, backgroundColor: '#0c0c0c' },
  select: {
    ...base.select,
    backgroundColor: '#101010',
    dropdown: { ...base.select.dropdown, backgroundColor: '#0c0c0c' },
  },
  modal: { ...base.modal, backgroundColor: '#0c0c0c' },
  tooltip: { ...base.tooltip, backgroundColor: '#141414', color: '#dedede' },
  button: {
    ...base.button,
    root: { ...base.button.root, fontFamily: font },
  },
};

export function MiniProvider({ children }) {
  return <ConfigContext.Provider value={{ theme, onThemeMode: "dark_mode" }}><Scrollable />{children}</ConfigContext.Provider>;
}
