# Optional visual-enhancement domain

V4 treats Three.js/WebGPU/TSL as optional enhancement, not an application
runtime dependency for identity, search, applications, companies, payments or
accessibility. The existing semantic DOM and server-rendered workflows must
remain usable if this directory is never imported or a renderer fails.

This directory may own browser-only scenes, renderer, animation, visual assets
and the narrowly typed route/selection/normalized-scroll bridge. It must not
import server or business feature modules, read cookies/database/roles, or
decide payment or navigation authorization. Load scenes dynamically and only
for routes/devices that benefit; provide static/DOM, reduced-motion and
unavailable-renderer fallbacks. Pause rendering while hidden and release GPU
resources on unmount.
