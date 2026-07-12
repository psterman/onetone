"""Build a side-by-side comparison image: current page vs design mockup."""
from PIL import Image
import os

base = r"C:\Users\Administrator\Desktop\voice-pilot\logs"

# Page 1: voice (current vs v18 mockup)
voice_current = Image.open(os.path.join(base, "voice-page-current-loaded.png"))
voice_mockup = Image.open(os.path.join(base, "voice-page-mockup-v18.png"))

# Page 2: triggers (current vs v16 mockup)
keys_current = Image.open(os.path.join(base, "triggers-page-current.png"))
keys_mockup = Image.open(os.path.join(base, "triggers-page-mockup-v16.png"))


def stack_vertical(left, right, label_left, label_right, padding=20, label_height=40):
    w = max(left.width, right.width)
    target_w = 900
    scale_l = target_w / left.width
    scale_r = target_w / right.width
    left_r = left.resize((target_w, int(left.height * scale_l)))
    right_r = right.resize((target_w, int(right.height * scale_r)))
    h = max(left_r.height, right_r.height)
    label_h = label_height
    canvas_h = label_h * 2 + h + padding
    canvas = Image.new("RGB", (target_w * 2 + padding, canvas_h), "white")
    canvas.paste(left_r, (0, label_h))
    canvas.paste(right_r, (target_w + padding, label_h))
    return canvas


voice_compare = stack_vertical(voice_current, voice_mockup, "当前 · 语音页 (读取中状态)", "v18 mockup · 语音页")
voice_compare.save(os.path.join(base, "compare-voice.png"), optimize=True)

keys_compare = stack_vertical(keys_current, keys_mockup, "当前 · 触发设置页", "v16 mockup · 触发设置页")
keys_compare.save(os.path.join(base, "compare-keys.png"), optimize=True)

print("Voice compare:", voice_compare.size)
print("Keys compare:", keys_compare.size)
