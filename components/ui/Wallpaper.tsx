/**
 * Fixed glacier background for the glass to sit on: folded light ribbons inspired by the
 * iPhone wallpaper, drawn with CSS gradients (see `.ui-wallpaper` in ui.css). Render once per screen.
 */
export function Wallpaper() {
  return (
    <div className="ui-wallpaper" aria-hidden>
      <span />
      <span />
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}
