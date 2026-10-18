import { ConfigContext } from "@mini-ui/CONTAINERs/config/context.js";
import defaults from "@mini-ui/BUILTIN_COMPONENTs/theme/default_mini_theme.json";
export { default as Button } from "@mini-ui/BUILTIN_COMPONENTs/input/button.js";
export { default as Modal } from "@mini-ui/BUILTIN_COMPONENTs/modal/modal.js";

const base = defaults.dark_mode;
const font = '"Nunito Sans", "Microsoft YaHei", system-ui, sans-serif';
const theme = {
  ...base,
  color: "#edf0e9",
  backgroundColor: "#151715",
  font: { ...base.font, fontFamily: font, fontSize: 14 },
  button: {
    ...base.button,
    root: { ...base.button.root, fontFamily: font, fontSize: 14, borderRadius: 9, color: "#d9ded5" },
  },
  modal: {
    ...base.modal,
    backgroundColor: "#1b1e1a",
    border: "1px solid #3a4038",
    borderRadius: 14,
  },
};

export function MiniProvider({ children }) {
  return <ConfigContext.Provider value={{ theme, onThemeMode: "dark_mode" }}>{children}</ConfigContext.Provider>;
}
