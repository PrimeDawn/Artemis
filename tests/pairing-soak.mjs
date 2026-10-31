// Retired by user D-018: all test rounds, including full suites, have a 300s total budget.
// Historical run evidence remains valid; this entry must not start a service or timer.
console.error('E_TEST_BUDGET: real-time long soak retired. Review no-TTL/persistence/reconnect code and necessary clock boundaries; total test round <=300 seconds.');
process.exitCode=2;
