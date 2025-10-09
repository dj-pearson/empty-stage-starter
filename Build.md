2025-10-09T19:46:12.472204Z	Cloning repository...
2025-10-09T19:46:13.539372Z	From https://github.com/dj-pearson/empty-stage-starter
2025-10-09T19:46:13.540168Z	 * branch            16a1a8dfbadfe67555e5cdfbbe8cc9b76d5b1212 -> FETCH_HEAD
2025-10-09T19:46:13.540313Z	
2025-10-09T19:46:13.590507Z	HEAD is now at 16a1a8d Update _redirects to clarify SPA fallback handling
2025-10-09T19:46:13.59091Z	
2025-10-09T19:46:13.668804Z	
2025-10-09T19:46:13.669205Z	Using v2 root directory strategy
2025-10-09T19:46:13.692538Z	Success: Finished cloning repository files
2025-10-09T19:46:15.451788Z	Checking for configuration in a Wrangler configuration file (BETA)
2025-10-09T19:46:15.452679Z	
2025-10-09T19:46:15.454235Z	Found wrangler.toml file. Reading build configuration...
2025-10-09T19:46:15.461242Z	pages_build_output_dir: dist
2025-10-09T19:46:15.461384Z	Build environment variables: (none found)
2025-10-09T19:46:16.581606Z	Successfully read wrangler.toml file.
2025-10-09T19:46:16.647663Z	Detected the following tools from environment: npm@10.9.2, nodejs@22.16.0
2025-10-09T19:46:16.648147Z	Installing project dependencies: npm clean-install --progress=false
2025-10-09T19:46:19.184347Z	npm warn deprecated sourcemap-codec@1.4.8: Please use @jridgewell/sourcemap-codec instead
2025-10-09T19:46:19.287387Z	npm warn deprecated rollup-plugin-inject@3.0.2: This package has been deprecated and is no longer maintained. Please use @rollup/plugin-inject.
2025-10-09T19:46:27.83351Z	
2025-10-09T19:46:27.833718Z	added 534 packages, and audited 535 packages in 11s
2025-10-09T19:46:27.833852Z	
2025-10-09T19:46:27.834402Z	95 packages are looking for funding
2025-10-09T19:46:27.834495Z	  run `npm fund` for details
2025-10-09T19:46:27.866834Z	
2025-10-09T19:46:27.867294Z	3 moderate severity vulnerabilities
2025-10-09T19:46:27.86741Z	
2025-10-09T19:46:27.867517Z	To address all issues (including breaking changes), run:
2025-10-09T19:46:27.867581Z	  npm audit fix --force
2025-10-09T19:46:27.867635Z	
2025-10-09T19:46:27.867703Z	Run `npm audit` for details.
2025-10-09T19:46:27.896874Z	Executing user command: npm run build
2025-10-09T19:46:28.270103Z	
2025-10-09T19:46:28.270403Z	> vite_react_shadcn_ts@0.0.0 build
2025-10-09T19:46:28.270564Z	> vite build
2025-10-09T19:46:28.270681Z	
2025-10-09T19:46:28.615822Z	[36mvite v5.4.20 [32mbuilding for production...[36m[39m
2025-10-09T19:46:28.957955Z	transforming...
2025-10-09T19:46:36.701333Z	[32m✓[39m 3784 modules transformed.
2025-10-09T19:46:38.9486Z	rendering chunks...
2025-10-09T19:46:48.473112Z	computing gzip size...
2025-10-09T19:46:48.516457Z	[2mdist/[22m[32mindex.html                      [39m[1m[2m   16.18 kB[22m[1m[22m[2m │ gzip:   4.35 kB[22m
2025-10-09T19:46:48.516786Z	[2mdist/[22m[2massets/[22m[35mcss/index-BC7ajq_K.css   [39m[1m[2m   81.31 kB[22m[1m[22m[2m │ gzip:  13.66 kB[22m
2025-10-09T19:46:48.516997Z	[2mdist/[22m[2massets/[22m[36mjs/router-DL2jr1mV.js    [39m[1m[2m   21.64 kB[22m[1m[22m[2m │ gzip:   7.89 kB[22m
2025-10-09T19:46:48.517152Z	[2mdist/[22m[2massets/[22m[36mjs/dnd-2U3w8Eoj.js       [39m[1m[2m   42.48 kB[22m[1m[22m[2m │ gzip:  13.93 kB[22m
2025-10-09T19:46:48.527423Z	[2mdist/[22m[2massets/[22m[36mjs/utils-DXd6fGgY.js     [39m[1m[2m   43.67 kB[22m[1m[22m[2m │ gzip:  12.92 kB[22m
2025-10-09T19:46:48.527661Z	[2mdist/[22m[2massets/[22m[36mjs/ui-B_vPLur4.js        [39m[1m[2m   83.77 kB[22m[1m[22m[2m │ gzip:  27.05 kB[22m
2025-10-09T19:46:48.52786Z	[2mdist/[22m[2massets/[22m[36mjs/vendor-CKZLQdbb.js    [39m[1m[2m  140.50 kB[22m[1m[22m[2m │ gzip:  45.07 kB[22m
2025-10-09T19:46:48.528073Z	[2mdist/[22m[2massets/[22m[36mjs/supabase-DVD1T_u_.js  [39m[1m[2m  145.69 kB[22m[1m[22m[2m │ gzip:  37.05 kB[22m
2025-10-09T19:46:48.52822Z	[2mdist/[22m[2massets/[22m[36mjs/web-B_7MChH9.js       [39m[1m[2m  413.59 kB[22m[1m[22m[2m │ gzip: 107.85 kB[22m
2025-10-09T19:46:48.528439Z	[2mdist/[22m[2massets/[22m[36mjs/index-Dj53ek98.js     [39m[1m[33m1,275.43 kB[39m[22m[2m │ gzip: 345.72 kB[22m
2025-10-09T19:46:48.528623Z	[32m✓ built in 19.89s[39m
2025-10-09T19:46:48.529702Z	[33m
2025-10-09T19:46:48.529953Z	(!) Some chunks are larger than 1000 kB after minification. Consider:
2025-10-09T19:46:48.530105Z	- Using dynamic import() to code-split the application
2025-10-09T19:46:48.530259Z	- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
2025-10-09T19:46:48.530433Z	- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.[39m
2025-10-09T19:46:48.903811Z	Finished
2025-10-09T19:46:49.80199Z	Checking for configuration in a Wrangler configuration file (BETA)
2025-10-09T19:46:49.802873Z	
2025-10-09T19:46:49.803551Z	Found wrangler.toml file. Reading build configuration...
2025-10-09T19:46:49.810111Z	pages_build_output_dir: dist
2025-10-09T19:46:49.810332Z	Build environment variables: (none found)
2025-10-09T19:46:50.916953Z	Successfully read wrangler.toml file.
2025-10-09T19:46:50.917794Z	Note: No functions dir at /functions found. Skipping.
2025-10-09T19:46:50.91791Z	Validating asset output directory
2025-10-09T19:46:53.753331Z	Deploying your site to Cloudflare's global network...
2025-10-09T19:46:55.061094Z	Parsed 17 valid redirect rules.
2025-10-09T19:46:55.061587Z	Parsed 27 valid header rules.
2025-10-09T19:46:56.290509Z	Uploading... (21/21)
2025-10-09T19:46:56.291579Z	✨ Success! Uploaded 0 files (21 already uploaded) (0.31 sec)
2025-10-09T19:46:56.291808Z	
2025-10-09T19:46:56.616784Z	✨ Upload complete!
2025-10-09T19:47:00.305999Z	Success: Assets published!
2025-10-09T19:47:01.959751Z	Success: Your site was deployed!