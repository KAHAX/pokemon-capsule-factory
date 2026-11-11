// The machine's three icon displays as chunky, glowing pixel screens with old-TV
// artefacts: horizontal wobble and tearing, rolling interference, static noise,
// RGB fringing and flicker. No glass reflection: the panel is pure emitted light.
export function upgradeScreens(screens, time) {
  const shared = { dsTime: time, dsGrid: { value: 32 } };
  screens.forEach((screen, index) => {
    const material = screen.material;
    if (!material || material.userData.ledScreen) return;
    material.userData.ledScreen = true;
    material.userData.noToon = true;
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, shared, { dsSeed: { value: index * 1.37 + .4 } });
      shader.fragmentShader = /* glsl */`uniform float dsTime, dsGrid, dsSeed;
        float dsH(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', /* glsl */`
        #ifdef USE_MAP
        {
          vec2 uv = vMapUv;
          float t = dsTime + dsSeed * 3.1;
          // Signal wobble: gentle sine sway plus occasional tearing bursts on a few rows.
          float burst = step(.93, dsH(vec2(floor(t * 2.3), dsSeed)));
          float row = floor(uv.y * 40.0);
          uv.x += sin(uv.y * 23.0 + t * 7.0) * .0025 + sin(uv.y * 3.0 - t * 1.3) * .002;
          uv.x += (dsH(vec2(row, floor(t * 18.0))) - .5) * .05 * burst;
          vec2 grid = vec2(dsGrid);
          vec2 g = uv * grid;
          vec2 cell = floor(g);
          vec2 f = fract(g) - .5;
          // Brightest of a 3x3 sample in each cell: thin strokes become solid pixels.
          vec3 c0 = vec3(0.0), cl = vec3(0.0), cr = vec3(0.0), cu = vec3(0.0), cd = vec3(0.0);
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
            vec2 o = vec2(float(x), float(y)) * .33 + .5;
            c0 = max(c0, texture2D(map, (cell + o) / grid).rgb);
            cl = max(cl, texture2D(map, (cell + o - vec2(1.0, 0.0)) / grid).rgb);
            cr = max(cr, texture2D(map, (cell + o + vec2(1.0, 0.0)) / grid).rgb);
            cu = max(cu, texture2D(map, (cell + o + vec2(0.0, 1.0)) / grid).rgb);
            cd = max(cd, texture2D(map, (cell + o - vec2(0.0, 1.0)) / grid).rgb);
          }
          // RGB fringing: neighbouring cells feed the red and blue channels.
          // Crisp posterised pixels: each cell is either clearly lit or dark.
          c0 = c0 * smoothstep(.18, .42, max(max(c0.r, c0.g), c0.b));
          vec3 texel = vec3(max(c0.r, cl.r * .22), c0.g, max(c0.b, cr.b * .22));
          // Square pixels with a dark gap, plus light bleeding into the gap from lit neighbours.
          float box = max(abs(f.x), abs(f.y));
          float aa = fwidth(g.x) * .9;
          float pixel = 1.0 - smoothstep(.42 - aa, .45 + aa, box);
          vec3 bleed = (cl + cr + cu + cd + c0 * 2.0) / 6.0;
          float level = max(max(emissive.r, emissive.g), emissive.b);
          // CRT artefacts: scanlines, rolling interference band, static and flicker.
          float scan = .9 + .1 * sin(g.y * 6.2831853);
          float roll = fract(uv.y * .8 - t * .35);
          float band = exp(-pow((roll - .5) * 12.0, 2.0));
          float noise = dsH(cell + floor(t * 24.0) * 7.31);
          float spark = step(.985, dsH(floor(uv * vec2(90.0, 60.0)) + floor(t * 30.0)));
          float flicker = .9 + .1 * sin(t * 61.0) * sin(t * 13.0);
          vec3 lit = texel * pixel * scan * flicker * (2.6 + level * 2.4) * (1.0 + band * .6);
          vec3 glow = bleed * (1.0 - pixel) * .3 * (1.0 + level);
          vec3 base = vec3(.010, .020, .028) * pixel * (.6 + .4 * noise) + vec3(.003, .006, .009);
          vec3 statik = vec3(.10, .16, .18) * (noise * noise * .35 + spark * .9) + vec3(.06, .10, .12) * band * .25;
          // Edge falloff of a curved tube.
          vec2 e = min(uv, 1.0 - uv);
          float bezel = smoothstep(.0, .09, min(e.x, e.y));
          outgoingLight = (lit + glow + base + statik) * bezel;
        }
        #endif
        #include <opaque_fragment>`);
    };
    material.customProgramCacheKey = () => 'dreamscape-crt-pixel-screen-v2';
    material.needsUpdate = true;
  });
}
