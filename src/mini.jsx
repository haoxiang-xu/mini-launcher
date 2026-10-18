import { ConfigContext } from "@mini-ui/CONTAINERs/config/context.js";
import defaults from "@mini-ui/BUILTIN_COMPONENTs/theme/default_mini_theme.json";
export { default as Button } from "@mini-ui/BUILTIN_COMPONENTs/input/button.js";
export { default as Modal } from "@mini-ui/BUILTIN_COMPONENTs/modal/modal.js";

const base = defaults.dark_mode;
const font = '"Nunito Sans", "Microsoft YaHei", system-ui, sans-serif';
const theme = {
  ...base,
  font: { ...base.font, fontFamily: font },
  button: {
    ...base.button,
    root: { ...base.button.root, fontFamily: font },
  },
};

export function MiniProvider({ children }) {
  return <ConfigContext.Provider value={{ theme, onThemeMode: "dark_mode" }}>{children}</ConfigContext.Provider>;
}
