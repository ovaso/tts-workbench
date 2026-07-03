// ComboboxOption: 入参为下拉展示标题和值；功能是描述 Vuetify combobox 选中对象。
export interface ComboboxOption {
  title: string;
  value: string;
}

// voiceInputValue: 入参为音色输入框当前值；输出可提交给后端的音色 id 字符串。
export function voiceInputValue(value: string | ComboboxOption | null): string {
  if (typeof value === "string") {
    return value.trim();
  }
  return value?.value.trim() ?? "";
}
