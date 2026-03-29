import io
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from PIL import Image

from .fit_result import FitResult

def render_metric_chart(fit: FitResult, current_val: float = None, width=420, height=300) -> bytes:
    """Renders the statistical distribution for a metric and marks the current live value.
    Returns the binary data for a BMP image, ready to be read by MQL5's OBJ_BITMAP_LABEL.
    """
    dpi = 100
    fig, ax = plt.subplots(figsize=(width/dpi, height/dpi), dpi=dpi)
    
    # Dark theme
    fig_bg = '#1e1e1e'
    ax_bg = '#1e1e1e'
    text_col = '#a0a0a0'
    hist_col = '#005588'
    line_col = '#00aaff'
    curr_col = '#ff3333'

    fig.patch.set_facecolor(fig_bg)
    ax.set_facecolor(ax_bg)
    ax.tick_params(colors=text_col, labelsize=8)
    for spine in ax.spines.values():
        spine.set_color('#404040')
    
    has_histogram = False
    
    if fit.empirical_percentiles:
        perc_vals = np.array(fit.empirical_percentiles)
        
        HIGHER_IS_WORSE = {"daily_loss", "max_drawdown", "consecutive_losses",
                           "stagnation_days", "stagnation_trades"}
        if fit.metric_name in HIGHER_IS_WORSE:
            perc_vals = np.maximum(0.0, perc_vals)
        
        data_range = perc_vals[-1] - perc_vals[0]
        if data_range > 0:
            n_bins = min(30, max(10, int(np.sqrt(len(perc_vals)))))
            ax.hist(perc_vals, bins=n_bins, density=True, color=hist_col, 
                    alpha=0.6, edgecolor='#003355', linewidth=0.5, label='Empirical')
            has_histogram = True
    
    if fit.passed and fit.distribution_name not in ("empirical", "none"):
        start = fit.ppf(0.001)
        end = fit.ppf(0.999)
        span = end - start
        x = np.linspace(start - 0.05*span, end + 0.05*span, 300)
        y = fit.pdf(x)
        ax.plot(x, y, color=line_col, linewidth=2.5, label=f'Fit: {fit.distribution_name}')
        ax.fill_between(x, 0, y, color=line_col, alpha=0.15)
        has_histogram = True
    
    if not has_histogram:
        ax.text(0.5, 0.5, 'No Data Available', color='red', 
                ha='center', va='center', transform=ax.transAxes)

    # Mark current value - skip if None
    if current_val is not None:
        ax.axvline(x=current_val, color=curr_col, linestyle='--', linewidth=2, label=f'Current: {current_val:.1f}')
        xlim = ax.get_xlim()
        
        if current_val > xlim[1]:
            ax.set_xlim(xlim[0], current_val * 1.15)
            xlim = ax.get_xlim()
        
        ha = 'left' if current_val < xlim[0] + (xlim[1]-xlim[0])*0.7 else 'right'
        ax.text(current_val, ax.get_ylim()[1]*0.9, f' {current_val:.1f} ', color=curr_col, 
                fontsize=9, fontweight='bold', ha=ha)
    
    ax.set_ylabel('Density', color=text_col, fontsize=8)
    
    title = fit.metric_name.replace('_', ' ').title()
    ax.set_title(title, color='white', fontsize=10, pad=10)
    
    # Legend — bottom-right, compact, semi-transparent
    if has_histogram:
        leg = ax.legend(fontsize=7, facecolor='#2a2a2a', edgecolor='#404040', 
                        labelcolor=text_col, loc='center right',
                        framealpha=0.8)
    
    plt.tight_layout()
    
    # Save fig to a raw RGBA buffer
    fig.canvas.draw()
    rgba_buffer = fig.canvas.buffer_rgba()
    
    # Convert RGBA to pillow Image
    img = Image.frombuffer('RGBA', fig.canvas.get_width_height(), rgba_buffer, 'raw', 'RGBA', 0, 1)
    # Convert to RGB for BMP support
    img = img.convert('RGB')
    
    buf = io.BytesIO()
    img.save(buf, format='BMP')
    plt.close(fig)
    return buf.getvalue()

