# pi-side-preview

Расширение для [pi](https://pi.dev/), которое открывает предпросмотр файлов, кода и изображений справа.

[English](../README.md) | [Русский](README.ru.md)

## Возможности

- Открывает текстовые и кодовые файлы в правом overlay-preview.
- Позволяет продолжать вводить текст в input pi, пока preview открыт.
- Подсветка синтаксиса для распространённых типов файлов через Markdown/code renderer pi.
- Открывает изображения (`png`, `jpg`, `jpeg`, `gif`, `webp`) в отдельном custom view, чтобы terminal inline images отображались корректно.
- Запоминает ширину/высоту preview между открытиями в текущем процессе pi.
- Позволяет менять ширину и высоту preview.
- Поддерживает прокрутку колесом мыши/трекпадом и режим нативного выделения текста терминалом.
- Копирует видимый текст или весь текстовый файл в буфер обмена на macOS через `pbcopy`.
- Позволяет настраивать хоткеи открытия и хоткеи внутри preview.

## Установка

Через npm:

```bash
pi install npm:pi-side-preview
```

Через GitHub/Git:

```bash
pi install git:github.com/samo33ddd/pi-side-preview
```

С привязкой к тегу или ветке:

```bash
pi install git:github.com/samo33ddd/pi-side-preview@v0.1.1
```

Из локальной папки:

```bash
pi install /path/to/pi-side-preview
```

Для разработки/тестирования без установки:

```bash
pi -e /path/to/pi-side-preview
```

После установки или изменения расширения выполните:

```text
/reload
```

## Команды

Открыть preview файла или изображения:

```text
/side-preview <path>
```

Если путь не передан, расширение сначала пробует взять первую строку из буфера обмена, а затем спрашивает путь вручную.

Настроить глобальные хоткеи открытия/toggle preview:

```text
/side-preview-bind show
/side-preview-bind reset
/side-preview-bind ctrl+alt+o ctrl+shift+o
```

После изменения хоткеев открытия нужен `/reload`.

Настроить клавиши внутри preview:

```text
/side-preview-keys show
/side-preview-keys reset
/side-preview-keys toggleWheel=ctrl+m copyView=ctrl+y copyAll=ctrl+shift+y widthGrow=alt+left widthShrink=alt+right heightShrink=alt+up heightGrow=alt+down close=escape
```

Чтобы применить изменения клавиш внутри preview, закройте и откройте preview заново.

## Хоткеи по умолчанию

Открыть/toggle preview:

- `Ctrl+Shift+O`
- `Ctrl+Alt+O`

Управление preview:

- `Ctrl+M`: переключить режим wheel/select
- `Ctrl+Y`: скопировать видимую часть preview
- `Ctrl+Shift+Y`: скопировать весь текст
- `Alt+Left` / `Alt+Right`: изменить ширину
- `Alt+Up` / `Alt+Down`: изменить высоту
- `Esc`: закрыть

## Выделение и прокрутка

По умолчанию включён режим прокрутки колесом мыши/трекпадом. Его можно переключить через `Ctrl+M`:

- wheel on: preview прокручивается колесом мыши/трекпадом;
- wheel off/select: можно использовать нативное выделение текста терминалом и копировать выделенный текст.

Для текстовых файлов также доступно копирование клавишами `Ctrl+Y` и `Ctrl+Shift+Y`.

## Конфиг

Пользовательский конфиг хранится здесь:

```text
~/.pi/agent/side-preview.json
```
