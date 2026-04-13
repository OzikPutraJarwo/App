(function registerNormalityModule() {
  const app = window.AnalysisApp;
  if (!app) {
    throw new Error("AnalysisApp must be loaded before normality modules.");
  }

  function runShapiroWilkPlaceholder() {
    app.renderComingSoonResult(
      "Normality / Shapiro-Wilk Test",
      "This analysis family is registered and ready for implementation.",
    );
  }

  app.registerType({
    id: "normality",
    label: "Normality",
    designs: [
      {
        id: "shapiro-wilk",
        label: "Shapiro-Wilk Test",
        supportedFactors: ["1"],
        run: runShapiroWilkPlaceholder,
      },
    ],
  });
})();
