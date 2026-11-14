import katex from 'katex';
import 'katex/dist/katex.min.css';
import { METHOD_MATH } from '../ui/methodMath';

function MathText({ tex, display = false }: { tex: string; display?: boolean }) {
  // Expressions are curated application strings, never user input. Keep HTML commands disabled.
  return <span dangerouslySetInnerHTML={{ __html: katex.renderToString(tex, { displayMode: display, output: 'htmlAndMathml', trust: false, strict: 'error' }) }} />;
}

export function MethodCalculation({ methodId, original }: { methodId: string; original: string }) {
  const math = METHOD_MATH[methodId];
  if (!math) return <div className="provenance-rule"><p>{original}</p></div>;
  return <section className="provenance-calculation" aria-label="Calculation explained">
    <p>{math.explanation}</p>
    <div className="provenance-equations" tabIndex={0} role="region" aria-label="Equations, scroll horizontally if needed">
      {math.equations.map((tex) => <div key={tex}><MathText tex={tex} display /></div>)}
    </div>
    <dl className="provenance-symbols">
      {math.symbols.map(([symbol, meaning]) => <div key={symbol}><dt><MathText tex={symbol} /></dt><dd>{meaning}</dd></div>)}
    </dl>
    <details className="provenance-notation"><summary>Original calculation notation</summary><pre className="formula">{original}</pre></details>
  </section>;
}
