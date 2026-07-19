"""Regenerate all app icons in one visual language:
full-bleed 256x256, vertical purple brand gradient + glass sheen,
single white glyph. (spectra.webp is intentionally untouched.)"""
import math
import os
from PIL import Image, ImageDraw, ImageFont

ICON_DIR = '/home/ozikjarwo/Documents/Blog/GitHub/App/icon'
S = 1024          # supersampled canvas
OUT = 256
W = 56            # standard stroke width @1024

TOP, BOTTOM = (143, 138, 210), (96, 92, 156)          # accent-light -> deep
MUT_TOP, MUT_BOTTOM = (163, 161, 189, 255), (131, 129, 156, 255)
WHITE = (255, 255, 255, 255)

DEJAVU = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
CJK = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'


def base(muted=False):
    img = Image.new('RGBA', (S, S))
    d = ImageDraw.Draw(img)
    t, b = (MUT_TOP, MUT_BOTTOM) if muted else (TOP + (255,), BOTTOM + (255,))
    for y in range(S):
        f = y / (S - 1)
        d.line([(0, y), (S, y)], fill=tuple(int(t[i] + (b[i] - t[i]) * f) for i in range(3)) + (255,))
    # glass sheen: soft white band fading out near 45% height
    sheen = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sheen)
    for y in range(int(S * .45)):
        a = int(46 * (1 - y / (S * .45)))
        sd.line([(0, y), (S, y)], fill=(255, 255, 255, a))
    img.alpha_composite(sheen)
    return img


def wa(alpha=1.0):
    return (255, 255, 255, int(255 * alpha))


def line_r(d, pts, w=W, fill=None):
    fill = fill or WHITE
    d.line(pts, fill=fill, width=w, joint='curve')
    for p in (pts[0], pts[-1]):
        d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=fill)


def rrect(d, box, r, w=W, fill=None, outline=None):
    if fill:
        d.rounded_rectangle(box, radius=r, fill=fill)
    else:
        d.rounded_rectangle(box, radius=r, outline=outline or WHITE, width=w)


def cubic(p0, p1, p2, p3, n=28):
    out = []
    for i in range(n + 1):
        t = i / n
        mt = 1 - t
        x = mt**3 * p0[0] + 3 * mt**2 * t * p1[0] + 3 * mt * t**2 * p2[0] + t**3 * p3[0]
        y = mt**3 * p0[1] + 3 * mt**2 * t * p1[1] + 3 * mt * t**2 * p2[1] + t**3 * p3[1]
        out.append((x, y))
    return out


def arc_pts(cx, cy, r, a0, a1, n=40):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
             cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def drop(d, cx, tip_y, cy, r, fill=None):
    # y grows downward, so the VISUAL bottom half-circle is angles 180 -> 90 -> 0
    left = cubic((cx, tip_y), (cx - r * .55, cy - r * 1.35), (cx - r, cy - r * .7), (cx - r, cy))
    bottom = arc_pts(cx, cy, r, 180, 0)
    right = cubic((cx + r, cy), (cx + r, cy - r * .7), (cx + r * .55, cy - r * 1.35), (cx, tip_y))
    d.polygon(left + bottom + right, fill=fill or WHITE)


def arrow_head(d, tip, angle, size=90, fill=None):
    a = math.radians(angle)
    l = math.radians(angle + 145)
    r = math.radians(angle - 145)
    d.polygon([tip,
               (tip[0] + size * math.cos(l), tip[1] + size * math.sin(l)),
               (tip[0] + size * math.cos(r), tip[1] + size * math.sin(r))], fill=fill or WHITE)


def text_center(d, txt, size, cy=512, font=DEJAVU, alpha=1.0, cx=512, tracking=0):
    f = ImageFont.truetype(font, size)
    bb = d.textbbox((0, 0), txt, font=f)
    w, h = bb[2] - bb[0], bb[3] - bb[1]
    d.text((cx - w / 2 - bb[0], cy - h / 2 - bb[1]), txt, font=f, fill=wa(alpha))


def photo_frame(d):
    rrect(d, [252, 292, 772, 732], 70, w=W)
    d.ellipse([560, 370, 680, 490], fill=WHITE)
    line_r(d, [(320, 660), (470, 500), (580, 620), (660, 540), (712, 592)], w=W)


def save(img, name):
    img = img.resize((OUT, OUT), Image.LANCZOS)
    path = os.path.join(ICON_DIR, name)
    if name.endswith('.png'):
        img.save(path, 'PNG')
    else:
        img.convert('RGB').save(path, 'WEBP', quality=92)
    print('saved', name)


def make(name, painter, muted=False):
    img = base(muted)
    painter(ImageDraw.Draw(img))
    save(img, name)


# ---------------- glyphs ----------------

def g_psychro(d):  # thermometer + droplet
    rrect(d, [318, 250, 442, 620], 62, w=W)
    d.ellipse([282, 580, 478, 776], fill=WHITE)
    drop(d, 664, 330, 620, 132)


def g_heatmap(d):
    alphas = [1, .55, .8, .5, 1, .38, .75, .5, 1]
    k = 0
    for r_ in range(3):
        for c in range(3):
            x = 262 + c * 180
            y = 262 + r_ * 180
            d.rounded_rectangle([x, y, x + 140, y + 140], radius=34, fill=wa(alphas[k]))
            k += 1


def g_sun(d):
    d.ellipse([362, 362, 662, 662], fill=WHITE)
    for i in range(8):
        a = math.radians(i * 45)
        p1 = (512 + 225 * math.cos(a), 512 + 225 * math.sin(a))
        p2 = (512 + 330 * math.cos(a), 512 + 330 * math.sin(a))
        line_r(d, [p1, p2], w=52)


def g_topik(d):
    text_center(d, '한', 520, cy=520, font=CJK)


def g_wallet(d):
    rrect(d, [244, 320, 780, 716], 70, w=W)
    d.rounded_rectangle([600, 456, 812, 580], radius=48, fill=WHITE)
    d.ellipse([700, 492, 752, 544], fill=(120, 116, 186, 255))


def g_task(d):
    rrect(d, [268, 320, 756, 760], 70, w=W)
    line_r(d, [(388, 252), (388, 396)], w=52)
    line_r(d, [(636, 252), (636, 396)], w=52)
    line_r(d, [(388, 620), (478, 700), (652, 508)], w=60)


def g_ks(d):
    # chart axes + one bold empirical CDF curve
    line_r(d, [(268, 258), (268, 760), (770, 760)], w=44, fill=wa(.5))
    pts = [(x, 742 - 452 / (1 + math.exp(-(x - 520) / 66))) for x in range(320, 780, 8)]
    d.line(pts, fill=WHITE, width=W, joint='curve')
    for p in (pts[0], pts[-1]):
        d.ellipse([p[0] - W / 2, p[1] - W / 2, p[0] + W / 2, p[1] + W / 2], fill=WHITE)


def g_spectrumchart(d):
    d.polygon([(430, 300), (250, 640), (610, 640)], outline=WHITE, width=W)
    line_r(d, [(470, 470), (780, 380)], w=44, fill=wa(1))
    line_r(d, [(500, 530), (800, 520)], w=44, fill=wa(.7))
    line_r(d, [(480, 590), (770, 660)], w=44, fill=wa(.45))


def g_agrimap(d):
    # outline pin: circle arc with a bottom gap, closed by two lines to the tip
    body = arc_pts(512, 430, 205, 125, 415)
    pts = [(512, 800)] + body + [(512, 800)]
    line_r(d, pts, w=W)
    # classic solid dot in the pin head
    d.ellipse([432, 350, 592, 510], fill=WHITE)


def g_vault(d):
    line_r(d, arc_pts(512, 420, 138, 180, 360), w=W)
    rrect(d, [318, 420, 706, 760], 62, w=W)
    d.ellipse([462, 520, 562, 620], fill=WHITE)
    line_r(d, [(512, 600), (512, 680)], w=48)


def g_cropid(d):
    line_r(d, [(512, 770), (512, 520)], w=52)
    l1 = cubic((512, 560), (330, 540), (270, 400), (300, 330)) + \
        cubic((300, 330), (450, 330), (520, 440), (512, 560))
    d.polygon(l1, fill=WHITE)
    l2 = cubic((512, 610), (660, 600), (740, 500), (730, 420)) + \
        cubic((730, 420), (600, 420), (520, 510), (512, 610))
    d.polygon(l2, fill=wa(.62))


def mono(txt, size=300):
    def painter(d):
        text_center(d, txt, size, cy=512)
    return painter


def g_qr(d):
    def finder(x, y):
        rrect(d, [x, y, x + 220, y + 220], 52, w=48)
        d.rounded_rectangle([x + 68, y + 68, x + 152, y + 152], radius=24, fill=WHITE)
    finder(252, 252)
    finder(552, 252)
    finder(252, 552)
    for (x, y) in [(600, 600), (712, 600), (600, 712), (712, 712), (656, 656)]:
        pass
    d.rounded_rectangle([560, 560, 648, 648], radius=22, fill=WHITE)
    d.rounded_rectangle([684, 560, 772, 648], radius=22, fill=wa(.6))
    d.rounded_rectangle([560, 684, 648, 772], radius=22, fill=wa(.6))
    d.rounded_rectangle([684, 684, 772, 772], radius=22, fill=WHITE)


def g_ocr(d):
    b = 130
    for (x, y, dx, dy) in [(252, 252, 1, 1), (772, 252, -1, 1), (252, 772, 1, -1), (772, 772, -1, -1)]:
        line_r(d, [(x, y + dy * b), (x, y), (x + dx * b, y)], w=50)
    text_center(d, 'A', 380, cy=520)


def g_doi(d):
    text_center(d, '“', 660, cy=430, cx=400)
    text_center(d, '”', 660, cy=620, cx=630, alpha=.6)


def g_renamer(d):
    rrect(d, [232, 262, 612, 692], 60, w=44, outline=wa(.45))
    rrect(d, [322, 342, 702, 772], 60, w=W)

    def pencil(hw, fill):
        ax, ay = 508, 858   # butt end
        bx, by = 742, 624   # where the tip cone starts
        ux, uy = math.sqrt(.5), -math.sqrt(.5)
        px, py = uy, -ux
        tip = (bx + (hw * 2.1) * ux, by + (hw * 2.1) * uy)
        d.polygon([(ax + px * hw, ay + py * hw), (bx + px * hw, by + py * hw),
                   (bx - px * hw, by - py * hw), (ax - px * hw, ay - py * hw)], fill=fill)
        d.polygon([(bx + px * hw, by + py * hw), tip, (bx - px * hw, by - py * hw)], fill=fill)

    # halo in the background tone separates the pencil from the file outline
    pencil(84, (104, 100, 164, 255))
    pencil(52, WHITE)


def g_pdf(d):
    rrect(d, [242, 262, 582, 682], 56, w=44, outline=wa(.5))
    rrect(d, [372, 372, 712, 792], 56, w=W)
    d.ellipse([600, 620, 800, 820], fill=WHITE)
    lw = 40
    line_r(d, [(700, 668), (700, 772)], w=lw, fill=(120, 116, 186, 255))
    line_r(d, [(648, 720), (752, 720)], w=lw, fill=(120, 116, 186, 255))


def g_imgconvert(d):
    photo_frame(d)
    line_r(d, arc_pts(688, 700, 150, 250, 420, n=30), w=46)
    arrow_head(d, (688 + 150 * math.cos(math.radians(60)), 700 + 150 * math.sin(math.radians(60))), 150, size=95)


def g_imgwatermark(d):
    photo_frame(d)
    text_center(d, 'A', 330, cy=666, cx=666, alpha=.75)


def g_imgcompress(d):
    photo_frame(d)
    line_r(d, [(806, 806), (664, 664)], w=52)
    arrow_head(d, (640, 640), 225 - 180, size=100)
    line_r(d, [(508, 872), (508, 792)], w=0, fill=wa(0))


def g_cv(d):
    rrect(d, [292, 252, 732, 772], 64, w=W)
    d.ellipse([442, 350, 582, 490], fill=WHITE)
    d.polygon([(377, 640)] + arc_pts(512, 640, 135, 180, 360) + [(647, 640)], fill=WHITE)
    line_r(d, [(392, 690), (632, 690)], w=0, fill=wa(0))


def g_dots(d):
    for i, x in enumerate([352, 512, 672]):
        d.ellipse([x - 56, 456, x + 56, 568], fill=WHITE)


def g_balik(d):
    text_center(d, 'a⇄b', 300, cy=512)


ICONS = [
    ('psychrometric-chart.webp', g_psychro),
    ('heatmap.webp', g_heatmap),
    ('lux-ppfd.webp', g_sun),
    ('TOPIK.webp', g_topik),
    ('finance-tracker.webp', g_wallet),
    ('task-planner.png', g_task),
    ('kolmogorov-smirnov.webp', g_ks),
    ('light-spectrum-chart.png', g_spectrumchart),
    ('agri-map.webp', g_agrimap),
    ('vault.webp', g_vault),
    ('cropid.webp', g_cropid),
    ('fisher-lsd.webp', mono('LSD')),
    ('tukey-hsd.webp', mono('HSD')),
    ('snk.webp', mono('SNK')),
    ('duncan-mrt.webp', mono('MRT')),
    ('scott-knott.webp', mono('SK', 340)),
    ('qr-generator.webp', g_qr),
    ('ocr.webp', g_ocr),
    ('doi.webp', g_doi),
    ('balik-huruf-kedelai.webp', g_balik),
    ('bulk-file-renamer.webp', g_renamer),
    ('pdf-combiner.webp', g_pdf),
    ('image-format-converter.webp', g_imgconvert),
    ('image-text-watermark.webp', g_imgwatermark),
    ('image-compressor.webp', g_imgcompress),
    ('cv.webp', g_cv),
]

for name, painter in ICONS:
    make(name, painter)
make('no-picture.webp', g_dots, muted=True)
print('ALL DONE')
