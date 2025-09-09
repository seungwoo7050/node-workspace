module.exports = {
  ci: {
    collect: { url: ["http://localhost:3000/orders"], numberOfRuns: 3 },
    assert: { assertions: { "categories:performance": ["warn", { minScore: 0.8 }] } },
  },
};