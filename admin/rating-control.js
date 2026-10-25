function normalizeRating(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const rating = Number(value);
  return Number.isFinite(rating) && rating >= 0 && rating <= 10
    ? Math.round(rating * 10) / 10
    : null;
}

function ratingText(value) {
  if (value === null) {
    return "未评分";
  }
  return `${Number.isInteger(value) ? value : value.toFixed(1)} / 10`;
}

export function createRatingControl(options = {}) {
  const root = document.createElement("div");
  root.className = "rating-control";

  const heading = document.createElement("div");
  heading.className = "rating-control-heading";
  const label = document.createElement("span");
  label.textContent = options.label ?? "评分";
  const output = document.createElement("output");
  output.className = "rating-control-value";
  heading.append(label, output);

  const group = document.createElement("div");
  group.className = "rating-options";
  group.setAttribute("role", "radiogroup");
  group.setAttribute("aria-label", "个人评分，1 到 10 分");
  group.title = "再次点击当前分数可取消评分";

  let value = normalizeRating(options.value);
  let disabled = Boolean(options.disabled);
  let buttons = [];

  function render() {
    output.textContent = ratingText(value);
    root.classList.toggle("has-fractional-rating", value !== null && !Number.isInteger(value));
    for (const button of buttons) {
      const selected = Number(button.dataset.rating) === value;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-checked", selected ? "true" : "false");
      button.disabled = disabled;
    }
    const selectedButton = buttons.find((button) =>
      button.classList.contains("is-selected"),
    );
    for (const button of buttons) {
      button.tabIndex = button === (selectedButton ?? buttons[0]) ? 0 : -1;
    }
  }

  function setValue(nextValue) {
    value = normalizeRating(nextValue);
    render();
  }

  function choose(nextValue) {
    if (disabled) {
      return;
    }
    setValue(value === nextValue ? null : nextValue);
    options.onChange?.(value);
  }

  buttons = Array.from({ length: 10 }, (_, index) => {
    const rating = index + 1;
    const button = document.createElement("button");
    button.className = "rating-option";
    button.type = "button";
    button.dataset.rating = String(rating);
    button.setAttribute("role", "radio");
    button.setAttribute("aria-label", `${rating} 分`);
    button.textContent = String(rating);
    button.addEventListener("click", () => choose(rating));
    button.addEventListener("keydown", (event) => {
      const direction =
        event.key === "ArrowRight" || event.key === "ArrowDown"
          ? 1
          : event.key === "ArrowLeft" || event.key === "ArrowUp"
            ? -1
            : 0;
      if (!direction) {
        return;
      }
      event.preventDefault();
      const next = Math.min(10, Math.max(1, rating + direction));
      setValue(next);
      options.onChange?.(value);
      buttons[next - 1].focus();
    });
    group.append(button);
    return button;
  });

  root.append(heading, group);
  render();

  return {
    element: root,
    focus: () => (buttons.find((button) => button.tabIndex === 0) ?? buttons[0]).focus(),
    getValue: () => value,
    setDisabled(nextDisabled) {
      disabled = Boolean(nextDisabled);
      render();
    },
    setValue,
  };
}
