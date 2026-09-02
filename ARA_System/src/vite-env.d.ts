/// <reference types="vite/client" />

// Vite's `?inline` query forces an asset to be embedded as a base64 data URI
// in the bundle (used for the Leaflet marker images). vite/client does not
// type assets imported with a query suffix, so declare them here.
declare module "*?inline" {
  const src: string;
  export default src;
}