# Joshua Williams - Portfolio & Interactive Work Samples

Live site: [https://coding-dev-tools.github.io/portfolio/](https://coding-dev-tools.github.io/portfolio/)

Self-contained static portfolio showcasing verified operations, learning design (ADDIE and vILT facilitation), escalation triage decision trees, generative AI verification workflows, SaaS enablement documentation, and live platform engineering projects.

## Local verification

```powershell
node --test demos/hris-identity/simulator.test.js
uv run --with playwright --with pypdf python -m unittest tests/test_portfolio_site.py -v
```
