import auFlag from "../assets/flags/au.svg";
import cnFlag from "../assets/flags/cn.svg";
import fjFlag from "../assets/flags/fj.svg";
import gbFlag from "../assets/flags/gb.svg";
import inFlag from "../assets/flags/in.svg";
import jpFlag from "../assets/flags/jp.svg";
import ncFlag from "../assets/flags/nc.svg";
import nzFlag from "../assets/flags/nz.svg";
import pgFlag from "../assets/flags/pg.svg";
import phFlag from "../assets/flags/ph.svg";
import sbFlag from "../assets/flags/sb.svg";
import toFlag from "../assets/flags/to.svg";
import usFlag from "../assets/flags/us.svg";
import vuFlag from "../assets/flags/vu.svg";
import wsFlag from "../assets/flags/ws.svg";

// ISO -> bundled flag image URL. Kept in the component layer (not in
// utils/phone.ts) because SVG imports only resolve under Vite - node:test
// cannot load them. Artwork: MIT-licensed `flag-icons` set, vendored so
// flags render identically on every OS (emoji flags degrade to bare
// letters on Windows and are not used).
export const FLAG_BY_ISO: Record<string, string> = {
  fj: fjFlag,
  ws: wsFlag,
  to: toFlag,
  vu: vuFlag,
  pg: pgFlag,
  sb: sbFlag,
  nc: ncFlag,
  au: auFlag,
  nz: nzFlag,
  us: usFlag,
  gb: gbFlag,
  in: inFlag,
  cn: cnFlag,
  ph: phFlag,
  jp: jpFlag,
};
