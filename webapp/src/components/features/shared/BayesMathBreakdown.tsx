import React from "react";
import { useTranslations } from "next-intl";
import BetaDistChart from "../charts/BetaDistChart";
import GaussianChart from "../charts/GaussianChart";

interface EVDecomposition {
  n_bt_wins: number;
  n_bt_losses: number;
  n_live_wins: number;
  n_live_losses: number;
  eff_bt_wins: number;
  eff_bt_losses: number;
  theta_alpha: number;
  theta_beta: number;
  theta_mean: number;
  theta_var: number;
  theta_lower: number;
  theta_upper: number;
  avg_win_bt: number;
  avg_win_live: number | null;
  avg_win_n: number;
  avg_win_mean: number;
  avg_win_var: number;
  avg_win_lower: number;
  avg_win_upper: number;
  avg_loss_bt: number;
  avg_loss_live: number | null;
  avg_loss_n: number;
  avg_loss_mean: number;
  avg_loss_var: number;
  avg_loss_lower: number;
  avg_loss_upper: number;
  ev_mean: number;
  ev_var: number;
  ev_std: number;
  ev_lower: number;
  ev_upper: number;
  p_positive: number;
  confidence: number;
  blind_risk: number;
}

interface BayesMathBreakdownProps {
  decomposition: EVDecomposition;
}

export default function BayesMathBreakdown({ decomposition: d }: BayesMathBreakdownProps) {
  const tMath = useTranslations("bayesMath");

  // Formatters used locally within the math block
  const usd = (v: number) => `$${v.toFixed(2)}`;
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

  return (
    <details className="group">
      <summary className="cursor-pointer text-xs text-[#00aaff] hover:text-[#00ccff] font-semibold flex items-center gap-1.5 select-none">
        <span className="transition-transform group-open:rotate-90">▶</span>
        📐 {tMath("title")}
      </summary>
      <div className="mt-3 space-y-4 border-l-2 border-iron-700 pl-4">

        {/* Variable glossary */}
        <div className="bg-iron-800/60 rounded-lg p-2.5 text-xs font-mono text-iron-500 grid grid-cols-2 gap-x-4 gap-y-0.5">
          <div><span className="text-[#00aaff] font-semibold">WR</span> = {tMath("glossary.wr_label")}</div>
          <div><span className="text-risk-green font-semibold">W</span> = {tMath("glossary.w_label")}</div>
          <div><span className="text-risk-red font-semibold">L</span> = {tMath("glossary.l_label")}</div>
          <div><span className="text-[#00ffaa] font-semibold">E(X)</span> = {tMath("glossary.ev_label")} = WR × W − (1−WR) × L</div>
        </div>

        {/* STEP 1: Win Rate */}
        <div className="space-y-1">
          <div className="text-sm font-semibold text-iron-200">
            {tMath("step1.title")}
          </div>
          <div className="text-xs text-iron-500">
            {tMath("step1.model")} <span className="text-iron-300 font-mono">Beta-Bernoulli</span>.
            {tMath("step1.modelDesc")}
          </div>
          <div className="bg-surface-tertiary rounded-lg p-3 text-xs font-mono space-y-1">
            <div className="text-iron-600 text-xs font-sans font-semibold mb-1">{tMath("step1.inputs")}</div>
            <div className="text-iron-500">Backtest: <span className="text-iron-300">{d.n_bt_wins}</span> wins + <span className="text-iron-300">{d.n_bt_losses}</span> losses = {d.n_bt_wins + d.n_bt_losses} trades</div>
            <div className="text-iron-500">Live: <span className="text-iron-300">{d.n_live_wins}</span> wins + <span className="text-iron-300">{d.n_live_losses}</span> losses = {d.n_live_wins + d.n_live_losses} trades</div>
            {(() => {
              const totalBt = d.n_bt_wins + d.n_bt_losses;
              const isCapped = totalBt > 30;
              return (
                <>
                  <div className="text-iron-600 text-xs font-sans font-semibold mt-2 mb-1">{tMath("step1.prior")}</div>
                  {isCapped ? (
                    <>
                      <div className="text-iron-500">n_eff = min({totalBt}, 30) = <span className="text-iron-300">30</span> <span className="text-iron-600">(cap)</span></div>
                      <div className="text-iron-500">α₀ = 30 × ({d.n_bt_wins}/{totalBt}) = <span className="text-iron-300">{d.eff_bt_wins}</span></div>
                      <div className="text-iron-500">β₀ = 30 × ({d.n_bt_losses}/{totalBt}) = <span className="text-iron-300">{d.eff_bt_losses}</span></div>
                    </>
                  ) : (
                    <>
                      <div className="text-iron-500">α₀ = <span className="text-iron-300">{d.eff_bt_wins}</span> <span className="text-iron-600">({d.n_bt_wins} wins)</span></div>
                      <div className="text-iron-500">β₀ = <span className="text-iron-300">{d.eff_bt_losses}</span> <span className="text-iron-600">({d.n_bt_losses} losses)</span></div>
                    </>
                  )}
                  <div className="text-iron-400">
                    Prior: Beta({d.eff_bt_wins}, {d.eff_bt_losses}) → Win Rate_prior = <span className="text-amber-400 font-semibold">{pct(d.eff_bt_wins / (d.eff_bt_wins + d.eff_bt_losses))}</span>
                  </div>
                </>
              );
            })()}

            <div className="text-iron-600 text-xs font-sans font-semibold mt-2 mb-1">{tMath("step1.posterior")}</div>
            <div className="text-iron-500">α = α₀ + {tMath("step4.liveWins")} = {d.eff_bt_wins} + {d.n_live_wins} = <span className="text-iron-300">{d.theta_alpha.toFixed(0)}</span></div>
            <div className="text-iron-500">β = β₀ + {tMath("step4.liveLosses")} = {d.eff_bt_losses} + {d.n_live_losses} = <span className="text-iron-300">{d.theta_beta.toFixed(0)}</span></div>
            <div className="text-iron-300 border-t border-iron-700 pt-1 mt-1">
              Posterior: Beta({d.theta_alpha.toFixed(0)}, {d.theta_beta.toFixed(0)}) → <span className="text-[#00aaff] font-semibold">WR = {pct(d.theta_mean)}</span>
            </div>
            <div className="text-iron-500 text-xs">
              IC {(d.confidence*100).toFixed(0)}%: [{pct(d.theta_lower)}, {pct(d.theta_upper)}]
            </div>
            <div className="text-iron-600 text-xs font-sans font-semibold mt-2 mb-1">{tMath("step1.variance")}</div>
            <div className="text-iron-500 text-xs">
              Var[WR] = α·β / ((α+β)²·(α+β+1))
            </div>
            <div className="text-iron-400 text-xs">
              = {d.theta_alpha.toFixed(0)}·{d.theta_beta.toFixed(0)} / (({d.theta_alpha.toFixed(0)}+{d.theta_beta.toFixed(0)})²·({(d.theta_alpha + d.theta_beta).toFixed(0)}+1))
            </div>
            <div className="text-[#00aaff] text-xs font-semibold">
              Var[WR] = {d.theta_var.toFixed(6)}
            </div>

          </div>
          <BetaDistChart
            priorA={d.eff_bt_wins} priorB={d.eff_bt_losses}
            postA={d.theta_alpha} postB={d.theta_beta}
            icLower={d.theta_lower} icUpper={d.theta_upper}
          />
        </div>
        <div className="space-y-1">
          <div className="text-sm font-semibold text-iron-200">
            {tMath("step2.title")}
          </div>
          <div className="text-xs text-iron-500">
            {tMath("step2.model")} <span className="text-iron-300 font-mono">Normal-Inverse-Gamma</span>.
            {tMath("step2.modelDesc")}
          </div>
          <div className="bg-surface-tertiary rounded-lg p-3 text-xs font-mono space-y-1">
            <div className="text-iron-600 text-xs font-sans font-semibold mb-1">{tMath("step1.inputs")}</div>
            <div className="text-iron-500">Backtest: <span className="text-iron-300">{d.n_bt_wins}</span> wins → media = <span className="text-iron-300">{usd(d.avg_win_bt)}</span></div>
            <div className="text-iron-500">Live: <span className="text-iron-300">{d.avg_win_n > 0 ? `${d.avg_win_n} wins → media = ${usd(d.avg_win_live!)}` : "sin datos live todavía"}</span></div>
            <div className="text-iron-500">
              {tMath("step1.confBtEff", { nEff: Math.round(d.eff_bt_wins), cap: 30 })}
            </div>

            <div className="text-iron-600 text-xs font-sans font-semibold mt-2 mb-1">{tMath("step2.calcMean")}</div>
            <div className="text-iron-500 text-xs font-sans">
              {tMath("step2.calcMeanDesc")}
            </div>
            {(() => {
              const nEff = Math.round(d.eff_bt_wins);
              const nLive = d.avg_win_n;
              const total = nEff + nLive;
              return (
                <div className="text-iron-400 mt-1 space-y-0.5">
                  <div>W = ({nEff} × {usd(d.avg_win_bt)} + {nLive} × {usd(d.avg_win_live ?? d.avg_win_bt)}) / ({nEff} + {nLive})</div>
                  <div className="text-iron-300 font-semibold">W = <span className="text-risk-green">{usd(d.avg_win_mean)}</span></div>
                </div>
              );
            })()}
            <div className="text-iron-500 text-xs border-t border-iron-700 pt-1 mt-1">
              IC {(d.confidence*100).toFixed(0)}%: [<span className="text-iron-300">{usd(d.avg_win_lower)}</span>, <span className="text-iron-300">{usd(d.avg_win_upper)}</span>]
            </div>
            {d.avg_win_live !== null && (
              <div className="text-iron-600 text-xs font-sans">
                Δ vs Backtest: {usd(d.avg_win_mean - d.avg_win_bt)} ({d.avg_win_mean > d.avg_win_bt ? tMath("step2.deltaBtUp") : tMath("step2.deltaBtDown")})
              </div>
            )}
            <div className="text-iron-600 text-xs font-sans font-semibold mt-2 mb-1">{tMath("step2.varianceTitle")}</div>
            {(() => {
              const nEff = Math.round(d.eff_bt_wins) + d.avg_win_n;
              const s2 = d.avg_win_var * nEff; // reverse: s² = Var[media] × n
              return (
                <div className="text-xs space-y-0.5">
                  <div className="text-iron-500 font-sans">
                    {tMath("step2.varianceDesc1")}
                  </div>
                  <div className="text-iron-400 font-mono bg-iron-800/40 rounded px-2 py-1">
                    Var[W] = s²<sub>wins</sub> / n<sub>eff</sub>
                  </div>
                  <div className="text-iron-500 font-sans">{tMath("step2.varianceWhere")}</div>
                  <div className="text-iron-400 pl-2 space-y-0.5">
                    <div>
                      s²<sub>wins</sub> = <span className="text-iron-300 font-semibold">{s2.toFixed(2)}</span>
                      <span className="text-iron-600"> {tMath("step2.varianceDisp", { count: d.n_bt_wins })}</span>
                    </div>
                    <div className="text-iron-600 text-[10px] pl-2">
                      s² = Σ(x<sub>i</sub> − x̄)² / (n − 1) — {tMath("step2.varianceBessel")}
                    </div>
                    <div>
                      n<sub>eff</sub> = <span className="text-iron-300 font-semibold">{nEff}</span>
                      <span className="text-iron-600">{tMath("step2.varianceEff")} eff_bt_wins = {Math.round(d.eff_bt_wins)}{d.avg_win_n > 0 ? tMath("step2.varianceEffLive", { n: d.avg_win_n }) : ''}</span>
                    </div>
                  </div>
                  <div className="text-iron-600 font-sans bg-iron-800/30 rounded p-1.5 mt-1">
                    {tMath("step2.varianceNote", { n_eff: nEff, n_bt: d.n_bt_wins })}
                  </div>
                  <div className="text-iron-600 font-sans bg-iron-800/30 rounded p-1.5 mt-1 text-[10px]">
                    {tMath("step2.varianceTheory")}
                  </div>
                  <div className="text-iron-400 font-mono mt-1">
                    Var[W] = {s2.toFixed(2)} / {nEff} = <span className="text-risk-green font-semibold">{d.avg_win_var.toFixed(4)}</span>
                  </div>
                  <div className="text-iron-500">
                    σ<sub>W</sub> = √Var = <span className="text-risk-green font-semibold">{usd(Math.sqrt(d.avg_win_var))}</span>
                  </div>
                  {(() => {
                    const df = Math.max(nEff, 4);
                    const sigma = Math.sqrt(d.avg_win_var);
                    const t_crit = sigma > 0 ? (d.avg_win_mean - d.avg_win_lower) / sigma : 0;
                    return (
                      <div className="text-iron-400 pl-2 space-y-0.5 mt-1 border-l-2 border-iron-700 ml-1">
                        <div className="text-iron-600 font-sans text-[10px] font-semibold">GRADOS DE LIBERTAD</div>
                        <div>df = max(n<sub>eff</sub>, 4) = max({nEff}, 4) = <span className="text-iron-300 font-semibold">{df}</span></div>
                        <div className="text-iron-600 text-[10px]">{tMath("step2.dfOrigin")}</div>
                        <div className="mt-1">t<sub>crit</sub> = t.ppf(0.975, df={df}) = <span className="text-iron-300 font-semibold">{t_crit.toFixed(2)}</span></div>
                        <div className="text-iron-600 text-[10px]">{tMath("step2.dfTcrit", { df })}</div>
                      </div>
                    );
                  })()}
                  <div className="text-iron-600 font-sans mt-1">
                    {tMath("step2.verify")} IC = W ± t<sub>crit</sub> × σ = {usd(d.avg_win_mean)} ± {usd(d.avg_win_mean - d.avg_win_lower)} = [{usd(d.avg_win_lower)}, {usd(d.avg_win_upper)}] ✅
                  </div>
                </div>
              );
            })()}
          </div>
          
          <details className="mt-2 border border-iron-800 rounded-lg bg-surface-tertiary w-full">
            <summary className="cursor-pointer text-xs text-iron-400 font-semibold p-2.5 hover:text-iron-200 select-none flex items-center gap-2">
              <span>💡</span> {tMath("step2.actuarialTitle")}
            </summary>
            <div className="px-3 pb-3 pt-1 space-y-2 text-[11px] leading-relaxed text-iron-500 font-sans border-t border-iron-800">
              <p>{tMath("step2.actuarialP1")}</p>
              <p>{tMath("step2.actuarialP2")}</p>
              <p>{tMath("step2.actuarialP3")}</p>
              <div className="pt-2 border-t border-iron-700/50 mt-2 text-iron-400 italic">
                {tMath("step2.actuarialQuote")}
              </div>
            </div>
          </details>

          <GaussianChart
            mean={d.avg_win_mean}
            std={(d.avg_win_upper - d.avg_win_lower) / (2 * 1.96)}
            lower={d.avg_win_lower}
            upper={d.avg_win_upper}
            label="W"
            color="#10b981"
            zeroLine={false}
            height={100}
            refLines={[{ x: d.avg_win_bt, color: "#f59e0b", label: `Backtest (${usd(d.avg_win_bt)})`, dashed: true }]}
          />
        </div>

        {/* STEP 3: AvgLoss */}
        <div className="space-y-1">
          <div className="text-sm font-semibold text-iron-200">
            {tMath("step3.title")}
          </div>
          <div className="text-xs text-iron-500">
            {tMath("step3.modelDesc")}
          </div>
          <div className="bg-surface-tertiary rounded-lg p-3 text-xs font-mono space-y-1">
            <div className="text-iron-600 text-xs font-sans font-semibold mb-1">{tMath("step1.inputs")}</div>
            <div className="text-iron-500">Backtest: <span className="text-iron-300">{d.n_bt_losses}</span> losses → media = <span className="text-iron-300">{usd(d.avg_loss_bt)}</span></div>
            <div className="text-iron-500">Live: <span className="text-iron-300">{d.avg_loss_n > 0 ? `${d.avg_loss_n} losses → media = ${usd(d.avg_loss_live!)}` : "sin datos live todavía"}</span></div>
            <div className="text-iron-500">
              {tMath("step1.confBtEff", { nEff: Math.round(d.eff_bt_losses), cap: 30 })}
            </div>

            <div className="text-iron-600 text-xs font-sans font-semibold mt-2 mb-1">{tMath("step2.calcMean")}</div>
            <div className="text-iron-500 text-xs font-sans">
              {tMath("step2.calcMeanDesc")}
            </div>
            {(() => {
              const nEff = Math.round(d.eff_bt_losses);
              const nLive = d.avg_loss_n;
              const total = nEff + nLive;
              return (
                <div className="text-iron-400 mt-1 space-y-0.5">
                  <div>L = ({nEff} × {usd(d.avg_loss_bt)} + {nLive} × {usd(d.avg_loss_live ?? d.avg_loss_bt)}) / ({nEff} + {nLive})</div>
                  <div className="text-iron-300 font-semibold">L = <span className="text-risk-red">{usd(d.avg_loss_mean)}</span></div>
                </div>
              );
            })()}
            <div className="text-iron-500 text-xs border-t border-iron-700 pt-1 mt-1">
              IC {(d.confidence*100).toFixed(0)}%: [<span className="text-iron-300">{usd(d.avg_loss_lower)}</span>, <span className="text-iron-300">{usd(d.avg_loss_upper)}</span>]
            </div>
            {d.avg_loss_live !== null && (
              <div className="text-iron-600 text-xs font-sans">
                Δ vs Backtest: {usd(d.avg_loss_mean - d.avg_loss_bt)} ({d.avg_loss_mean > d.avg_loss_bt ? tMath("step3.deltaBtUp") : tMath("step3.deltaBtDown")})
              </div>
            )}
            <div className="text-iron-600 text-xs font-sans font-semibold mt-2 mb-1">{tMath("step2.varianceTitle")}</div>
            {(() => {
              const nEff = Math.round(d.eff_bt_losses) + d.avg_loss_n;
              const s2 = d.avg_loss_var * nEff;
              return (
                <div className="text-xs space-y-0.5">
                  <div className="text-iron-500 font-sans">
                    {tMath("step2.varianceDesc1")}
                  </div>
                  <div className="text-iron-400 font-mono bg-iron-800/40 rounded px-2 py-1">
                    Var[L] = s²<sub>losses</sub> / n<sub>eff</sub>
                  </div>
                  <div className="text-iron-500 font-sans">{tMath("step2.varianceWhere")}</div>
                  <div className="text-iron-400 pl-2 space-y-0.5">
                    <div>
                      s²<sub>losses</sub> = <span className="text-iron-300 font-semibold">{s2.toFixed(2)}</span>
                      <span className="text-iron-600"> {tMath("step3.varianceDisp", { count: d.n_bt_losses })}</span>
                    </div>
                    <div className="text-iron-600 text-[10px] pl-2">
                      s² = Σ(x<sub>i</sub> − x̄)² / (n − 1) — {tMath("step2.varianceBessel")}
                    </div>
                    <div>
                      n<sub>eff</sub> = <span className="text-iron-300 font-semibold">{nEff}</span>
                      <span className="text-iron-600">{tMath("step3.varianceEff")} eff_bt_losses = {Math.round(d.eff_bt_losses)}{d.avg_loss_n > 0 ? tMath("step2.varianceEffLive", { n: d.avg_loss_n }) : ''}</span>
                    </div>
                  </div>
                  <div className="text-iron-600 font-sans bg-iron-800/30 rounded p-1.5 mt-1">
                    {tMath("step2.varianceNote", { n_eff: nEff, n_bt: d.n_bt_losses })}
                  </div>
                  <div className="text-iron-600 font-sans bg-iron-800/30 rounded p-1.5 mt-1 text-[10px]">
                    {tMath("step2.varianceTheory")}
                  </div>
                  <div className="text-iron-400 font-mono mt-1">
                    Var[L] = {s2.toFixed(2)} / {nEff} = <span className="text-risk-red font-semibold">{d.avg_loss_var.toFixed(4)}</span>
                  </div>
                  <div className="text-iron-500">
                    σ<sub>L</sub> = √Var = <span className="text-risk-red font-semibold">{usd(Math.sqrt(d.avg_loss_var))}</span>
                  </div>
                  {(() => {
                    const df = Math.max(nEff, 4);
                    const sigma = Math.sqrt(d.avg_loss_var);
                    const t_crit = sigma > 0 ? (d.avg_loss_mean - d.avg_loss_lower) / sigma : 0;
                    return (
                      <div className="text-iron-400 pl-2 space-y-0.5 mt-1 border-l-2 border-iron-700 ml-1">
                        <div className="text-iron-600 font-sans text-[10px] font-semibold">GRADOS DE LIBERTAD</div>
                        <div>df = max(n<sub>eff</sub>, 4) = max({nEff}, 4) = <span className="text-iron-300 font-semibold">{df}</span></div>
                        <div className="text-iron-600 text-[10px]">{tMath("step2.dfOrigin")}</div>
                        <div className="mt-1">t<sub>crit</sub> = t.ppf(0.975, df={df}) = <span className="text-iron-300 font-semibold">{t_crit.toFixed(2)}</span></div>
                        <div className="text-iron-600 text-[10px]">{tMath("step2.dfTcrit", { df })}</div>
                      </div>
                    );
                  })()}
                  <div className="text-iron-600 font-sans mt-1">
                    {tMath("step2.verify")} IC = L ± t<sub>crit</sub> × σ = {usd(d.avg_loss_mean)} ± {usd(d.avg_loss_mean - d.avg_loss_lower)} = [{usd(d.avg_loss_lower)}, {usd(d.avg_loss_upper)}] ✅
                  </div>
                </div>
              );
            })()}
          </div>
          <GaussianChart
            mean={d.avg_loss_mean}
            std={(d.avg_loss_upper - d.avg_loss_lower) / (2 * 1.96)}
            lower={d.avg_loss_lower}
            upper={d.avg_loss_upper}
            label="L"
            color="#ef4444"
            zeroLine={false}
            height={100}
            refLines={[{ x: d.avg_loss_bt, color: "#f59e0b", label: `Backtest (${usd(d.avg_loss_bt)})`, dashed: true }]}
          />
        </div>

        {/* STEP 4: Combine */}
        <div className="space-y-1">
          <div className="text-sm font-semibold text-iron-200">
            {tMath("step4.title")}
          </div>
          <div className="text-xs text-iron-500">
            {tMath("step4.modelDesc")}
          </div>
          <div className="bg-surface-tertiary rounded-lg p-3 text-xs font-mono space-y-1">
            <div className="text-iron-600 text-xs font-sans font-semibold mb-1">{tMath("step4.formula")}</div>
            <div className="text-iron-400">E(X) = WR × W − (1 − WR) × L</div>
            <div className="text-iron-400">E(X) = {pct(d.theta_mean)} × {usd(d.avg_win_mean)} − {pct(1-d.theta_mean)} × {usd(d.avg_loss_mean)}</div>
            <div className="text-[#00ffaa] font-semibold text-sm border-t border-iron-700 pt-1 mt-1">
              E(X) = {usd(d.ev_mean)} {tMath("step4.perTrade")}
            </div>

            <div className="text-iron-600 text-xs font-sans font-semibold mt-3 mb-1">{tMath("step4.uncertaintyTitle")}</div>
            <div className="text-iron-500 text-xs font-sans mb-1">
              {tMath("step4.uncertaintyDesc")}
            </div>
            <div className="text-iron-400 text-xs">Var[E(X)] = W² × Var[WR] + WR² × Var[W] + L² × Var[WR] + (1−WR)² × Var[L]</div>
            <div className="bg-iron-800/60 rounded p-2 mt-1 space-y-1.5 text-xs">
              <div>
                <div className="text-iron-500">
                  Var[WR] = <span className="text-iron-300 font-semibold">{d.theta_var.toFixed(6)}</span>
                  <span className="text-iron-600 ml-2">{tMath("step4.fromStep1")}</span>
                </div>
                <div className="text-iron-600 pl-2">
                  = α·β / ((α+β)²·(α+β+1)) = {d.theta_alpha.toFixed(0)}·{d.theta_beta.toFixed(0)} / (({d.theta_alpha.toFixed(0)}+{d.theta_beta.toFixed(0)})²·({(d.theta_alpha + d.theta_beta).toFixed(0)}+1))
                </div>
              </div>
              <div>
                <div className="text-iron-500">
                  Var[W] = <span className="text-iron-300 font-semibold">{d.avg_win_var.toFixed(4)}</span>
                  <span className="text-iron-600 ml-2">{tMath("step4.fromStep2")}</span>
                </div>
                <div className="text-iron-600 pl-2">
                  = {tMath("step4.fromStep2Desc")} ({d.avg_win_n} {tMath("step4.liveWins")})
                </div>
              </div>
              <div>
                <div className="text-iron-500">
                  Var[L] = <span className="text-iron-300 font-semibold">{d.avg_loss_var.toFixed(4)}</span>
                  <span className="text-iron-600 ml-2">{tMath("step4.fromStep3")}</span>
                </div>
                <div className="text-iron-600 pl-2">
                  = {tMath("step4.fromStep3Desc")} ({d.avg_loss_n} {tMath("step4.liveLosses")})
                </div>
              </div>
              {(() => {
                const W = d.avg_win_mean;
                const L = d.avg_loss_mean;
                const Vt = d.theta_var;
                const Vw = d.avg_win_var;
                const Vl = d.avg_loss_var;
                const t1 = W * W * Vt;
                const t2 = d.theta_mean * d.theta_mean * Vw;
                const t3 = L * L * Vt;
                const t4 = (1 - d.theta_mean) ** 2 * Vl;
                const evVar = t1 + t2 + t3 + t4;
                return (
                  <>
                    <div className="text-iron-400 mt-1 border-t border-iron-700 pt-1">
                      = {usd(W)}² × {Vt.toFixed(6)} + {pct(d.theta_mean)}² × {Vw.toFixed(4)} + {usd(L)}² × {Vt.toFixed(6)} + {pct(1 - d.theta_mean)}² × {Vl.toFixed(4)}
                    </div>
                    <div className="text-iron-300">Var[E(X)] = {evVar.toFixed(4)}</div>
                    <div className="text-[#00ffaa] font-semibold">σ = √Var = {usd(Math.sqrt(evVar))}</div>
                  </>
                );
              })()}
            </div>
            <div className="text-iron-500 text-xs mt-1">
              IC = E(X) ± z × σ = {usd(d.ev_mean)} ± {(1.96).toFixed(2)} × {usd(d.ev_std)} = [{usd(d.ev_lower)}, {usd(d.ev_upper)}]
            </div>
          </div>
          <GaussianChart
            mean={d.ev_mean} std={d.ev_std}
            lower={d.ev_lower} upper={d.ev_upper}
            label="Expectancy"
          />
        </div>
        <div className="space-y-1">
          <div className="text-sm font-semibold text-iron-200">
            {tMath("step5.title")}
          </div>
          <div className="text-xs text-iron-500">
            {tMath("step5.modelDesc")}
          </div>
          <div className="bg-surface-tertiary rounded-lg p-3 text-xs font-mono space-y-1">
            <div className="text-iron-600 text-xs font-sans font-semibold mb-1">{tMath("step5.whatIsPhi")}</div>
            <div className="text-iron-500 text-xs font-sans">
              {tMath("step5.phiDesc1")}
              <br/>{tMath("step5.phiDesc2")}
            </div>

            <div className="text-iron-600 text-xs font-sans font-semibold mt-2 mb-1">{tMath("step5.stepByStep")}</div>
            <div className="text-iron-500 text-xs font-sans">
              {tMath("step5.sbsDesc")}
            </div>
            <div className="text-iron-400 pl-2">
              <div>μ = <span className="text-iron-300">{usd(d.ev_mean)}</span> <span className="text-iron-600">{tMath("step5.meanText")}</span></div>
              <div>σ = <span className="text-iron-300">{usd(d.ev_std)}</span> <span className="text-iron-600">{tMath("step5.uncertText")}</span></div>
            </div>

            <div className="text-iron-500 text-xs font-sans mt-1">
              {tMath("step5.question")} <em className="text-iron-300">{tMath("step5.questionText")}</em>
            </div>

            {(() => {
              const z = (0 - d.ev_mean) / d.ev_std;
              return (
                <div className="bg-iron-800/40 rounded p-2 mt-1 space-y-0.5">
                  <div className="text-iron-600 text-xs font-sans font-semibold">{tMath("step5.calc1")}</div>
                  <div className="text-iron-400">
                    z = (0 − μ) / σ = (0 − {d.ev_mean.toFixed(2)}) / {d.ev_std.toFixed(2)} = <span className="text-iron-300 font-semibold">{z.toFixed(2)}</span>
                  </div>
                  <div className="text-iron-600 text-xs font-sans mt-1">
                    {tMath("step5.calc1Result", { val: Math.abs(z).toFixed(2), dir: z < 0 ? tMath("step5.left") : tMath("step5.right") })}
                  </div>

                  <div className="text-iron-600 text-xs font-sans font-semibold mt-2">{tMath("step5.calc2")}</div>
                  <div className="text-iron-400">
                    Φ({z.toFixed(2)}) = <span className="text-iron-300">{(1 - d.p_positive).toFixed(4)}</span>
                    <span className="text-iron-600"> {tMath("step5.calc2Result", { pct: ((1 - d.p_positive) * 100).toFixed(1) })}</span>
                  </div>

                  <div className="text-iron-600 text-xs font-sans font-semibold mt-2">{tMath("step5.calc3")}</div>
                  <div className="text-iron-400">
                    P(Expectancy &gt; 0) = 1 − Φ({z.toFixed(2)}) = 1 − {(1 - d.p_positive).toFixed(4)}
                  </div>
                </div>
              );
            })()}

            <div className={`font-semibold text-sm border-t border-iron-700 pt-1 mt-1 ${d.p_positive > 0.8 ? "text-risk-green" : d.p_positive > 0.5 ? "text-amber-400" : "text-risk-red"}`}>
              P(Expectancy &gt; 0) = {(d.p_positive * 100).toFixed(1)}%
            </div>
            <div className="text-iron-600 text-xs font-sans">
              → {tMath("step5.finalResult", { pct: (d.p_positive * 100).toFixed(1) })}
            </div>
            
            <details className="mt-4 border border-iron-800 rounded-lg bg-surface-tertiary">
              <summary className="cursor-pointer text-xs text-iron-400 font-semibold p-2.5 hover:text-iron-200 select-none flex items-center gap-2">
                <span>💡</span> {tMath("step5.cltTitle")}
              </summary>
              <div className="px-3 pb-3 pt-1 space-y-2 text-xs text-iron-500 font-sans border-t border-iron-800">
                <p>{tMath("step5.cltDesc1")}</p>
                <p>{tMath("step5.cltDesc2")}</p>
              </div>
            </details>
          </div>
          <GaussianChart
            mean={d.ev_mean} std={d.ev_std}
            lower={d.ev_lower} upper={d.ev_upper}
            label="Expectancy"
            hideIcFill
            shadeAbove={0}
            shadeAboveColor="#10b981"
            shadeAboveLabel={`P(Expectancy > 0) = ${(d.p_positive * 100).toFixed(1)}%`}
            shadeBelow={0}
            shadeBelowColor="#ef4444"
            shadeBelowLabel={`P(Expectancy < 0) = ${((1 - d.p_positive) * 100).toFixed(1)}%`}
            refLines={[
              { x: d.ev_lower, color: "#f59e0b", dashed: true, hideLegend: true },
              { x: d.ev_upper, color: "#f59e0b", dashed: true, hideLegend: true },
            ]}
          />
        </div>

      </div>
    </details>
  );
}
