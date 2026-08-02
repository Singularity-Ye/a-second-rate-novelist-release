import {
  createLocalTrustedRouteAdapter,
  readLocalTrustedRouteAdapterConfig,
} from "./local-trusted-route-adapter.js";

const config = readLocalTrustedRouteAdapterConfig();
const server = createLocalTrustedRouteAdapter({ config });

server.listen(config.port, config.host, () => {
  process.stdout.write(
    `vNext local trusted route adapter listening on http://${config.host}:${config.port}; route=${config.provider}/${config.model}\n`,
  );
});

function shutdown() {
  server.close((error) => {
    if (error) {
      process.stderr.write("vNext local trusted route adapter shutdown failed\n");
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
