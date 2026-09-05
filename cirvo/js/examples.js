/* ============================================================
   Cirvo — starter programs
   Each one names the parts it expects, so the Code panel can say
   what to drop on the canvas before pressing Run.
   ============================================================ */

const CirvoExamples = [
  {
    id: 'blink',
    name: 'Blink an LED',
    icon: 'lightbulb',
    needs: ['raspberry-pi-5', 'led-5mm', 'resistor'],
    hint: 'Pi 5 · LED on GPIO17 through a resistor to GND',
    code: `# Wire: GPIO17 -> resistor -> LED anode, LED cathode -> GND
from gpiozero import LED
from time import sleep

led = LED(17)

while True:
    led.on()
    print("on")
    sleep(0.5)
    led.off()
    print("off")
    sleep(0.5)
`,
  },
  {
    id: 'button',
    name: 'Button turns the LED on',
    icon: 'touch_app',
    needs: ['raspberry-pi-5', 'push-button', 'led-5mm'],
    hint: 'Press the button on the canvas while this runs',
    code: `# Wire: button between GPIO2 and GND, LED on GPIO17
from gpiozero import LED, Button
from time import sleep

led = LED(17)
button = Button(2)

while True:
    if button.is_pressed:
        led.on()
    else:
        led.off()
    sleep(0.02)
`,
  },
  {
    id: 'fade',
    name: 'Fade an LED with PWM',
    icon: 'gradient',
    needs: ['raspberry-pi-5', 'led-5mm'],
    hint: 'The glow follows the duty cycle',
    code: `from gpiozero import PWMLED
from time import sleep

led = PWMLED(18)

while True:
    for i in range(21):
        led.value = i / 20.0
        sleep(0.03)
    for i in range(21):
        led.value = 1 - i / 20.0
        sleep(0.03)
`,
  },
  {
    id: 'irrigation',
    name: 'Soil moisture waters the plant',
    icon: 'water_drop',
    needs: ['raspberry-pi-5', 'mcp3008', 'hw-080-soil-module', 'relay-1ch', 'water-pump'],
    hint: 'Drag the Soil slider in the World tab to make it dry',
    code: `# Pi 5 + MCP3008 (SPI) + HW-080 soil probe on CH0 + relay driving a pump
from gpiozero import MCP3008, OutputDevice
from time import sleep

soil  = MCP3008(channel=0)
pump  = OutputDevice(18)     # relay IN
DRY   = 0.55                 # above this the soil counts as dry

while True:
    reading = soil.value
    dry = reading > DRY
    print(f"soil {reading:.2f}  {'DRY' if dry else 'wet'}")
    if dry:
        pump.on()
    else:
        pump.off()
    sleep(0.5)
`,
  },
  {
    id: 'climate',
    name: 'Climate readout on the OLED',
    icon: 'thermostat',
    needs: ['raspberry-pi-5', 'dht22', 'ssd1306-oled'],
    hint: 'Move the Temperature and Humidity sliders while it runs',
    code: `# DHT22 on GPIO4, SSD1306 OLED on I2C
from cirvo import DHT, OLED
from time import sleep

sensor = DHT(4)
screen = OLED()

while True:
    t, h = sensor.read()
    screen.clear()
    screen.text("Greenhouse", 0, 0)
    screen.text(f"temp {t:5.1f} C", 0, 1)
    screen.text(f"hum  {h:5.1f} %", 0, 2)
    print(f"{t:.1f} C  {h:.1f} %")
    sleep(1)
`,
  },
  {
    id: 'fan',
    name: 'Fan when it gets hot',
    icon: 'mode_fan',
    needs: ['raspberry-pi-5', 'dht22', 'relay-1ch', 'dc-fan-40'],
    hint: 'Push Temperature past 30 and the fan starts',
    code: `from cirvo import DHT
from gpiozero import OutputDevice
from time import sleep

sensor = DHT(4)
fan = OutputDevice(23)

while True:
    t, h = sensor.read()
    if t > 30:
        fan.on()
        print(f"{t:.1f} C - fan on")
    else:
        fan.off()
        print(f"{t:.1f} C - fan off")
    sleep(0.5)
`,
  },
  {
    id: 'servo',
    name: 'Sweep a servo',
    icon: 'settings_backup_restore',
    needs: ['raspberry-pi-5', 'servo-sg90'],
    hint: 'Watch the horn turn on the canvas',
    code: `from gpiozero import AngularServo
from time import sleep

servo = AngularServo(12, min_angle=0, max_angle=180)

while True:
    for a in range(0, 181, 10):
        servo.angle = a
        sleep(0.05)
    for a in range(180, -1, -10):
        servo.angle = a
        sleep(0.05)
`,
  },
  {
    id: 'rgb',
    name: 'RGB LED colour cycle',
    icon: 'palette',
    needs: ['raspberry-pi-5', 'rgb-led'],
    hint: 'Common-cathode RGB LED on GPIO17 / 27 / 22',
    code: `from gpiozero import RGBLED
from time import sleep

led = RGBLED(17, 27, 22)
colours = [(1,0,0), (1,.5,0), (1,1,0), (0,1,0), (0,1,1), (0,0,1), (1,0,1)]

while True:
    for c in colours:
        led.color = c
        sleep(0.25)
`,
  },
  {
    id: 'rpigpio',
    name: 'RPi.GPIO style',
    icon: 'memory',
    needs: ['raspberry-pi-5', 'led-5mm'],
    hint: 'The classic library, if that is what you know',
    code: `import RPi.GPIO as GPIO
import time

GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)
GPIO.setup(17, GPIO.OUT)

pwm = GPIO.PWM(17, 100)
pwm.start(0)

try:
    while True:
        for duty in range(0, 101, 5):
            pwm.ChangeDutyCycle(duty)
            time.sleep(0.03)
        for duty in range(100, -1, -5):
            pwm.ChangeDutyCycle(duty)
            time.sleep(0.03)
finally:
    GPIO.cleanup()
`,
  },
  {
    id: 'micropython',
    name: 'MicroPython on an ESP32',
    icon: 'wifi',
    needs: ['esp32-devkit-v1', 'led-5mm'],
    hint: 'Put an ESP32 DevKit on the canvas for this one',
    code: `from machine import Pin, PWM
import time

led = PWM(Pin(2, Pin.OUT), freq=1000)

while True:
    for d in range(0, 1024, 32):
        led.duty(d)
        time.sleep(0.02)
    for d in range(1023, -1, -32):
        led.duty(d)
        time.sleep(0.02)
`,
  },
  {
    id: 'neopixel',
    name: 'Chase along an LED strip',
    icon: 'blur_on',
    needs: ['raspberry-pi-5', 'ws2812b-strip'],
    hint: 'WS2812B strip, data on GPIO18',
    code: `from cirvo import NeoPixel
from time import sleep

strip = NeoPixel(18, 8)

while True:
    for i in range(8):
        strip.fill((0, 0, 0))
        strip[i] = (0, 180, 90)
        strip.show()
        sleep(0.08)
`,
  },
  {
    id: 'stepper',
    name: 'Turn a 28BYJ-48 stepper',
    icon: 'settings_backup_restore',
    needs: ['raspberry-pi-5', 'uln2003-driver', 'stepper-28byj-48'],
    hint: 'Pi -> ULN2003 IN1-IN4, and the motor into the 5-way socket',
    code: `from cirvo import Stepper
from time import sleep

motor = Stepper(17, 18, 27, 22)   # IN1 IN2 IN3 IN4

while True:
    motor.turn(90)                # a quarter turn one way
    sleep(0.4)
    motor.turn(-90)               # and back
    sleep(0.4)
`,
  },
  {
    id: 'lcd',
    name: 'Distance on the LCD',
    icon: 'straighten',
    needs: ['raspberry-pi-5', 'hc-sr04', 'lcd-1602-i2c'],
    hint: 'Drag the Distance slider in the World tab',
    code: `from gpiozero import DistanceSensor
from cirvo import LCD
from time import sleep

sonar = DistanceSensor(echo=24, trigger=23)
lcd = LCD()

while True:
    cm = sonar.distance * 100
    lcd.clear()
    lcd.write("Distance", 0, 0)
    lcd.write(f"{cm:6.1f} cm", 0, 1)
    print(f"{cm:.1f} cm")
    sleep(0.4)
`,
  },
];
