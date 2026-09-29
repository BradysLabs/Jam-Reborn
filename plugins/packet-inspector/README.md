# Packet Inspector

A live, searchable view of every packet going to and from Animal Jam, with a
plain-English explanation and field-by-field breakdown for known packet types.

## Usage

1. Click **Packet Inspector** in the plugins sidebar.
2. Play the game — packets stream in live.
   - **↓ green** = incoming (server → you)
   - **↑ amber** = outgoing (you → server)
3. Click any packet to see, in the bottom pane: its name, what it does, the
   raw string (with a Copy button), and a table of each field's meaning.
4. **Filter** with the search box (matches type, name, or content) and the
   **All / In / Out** buttons.
5. **Pause** freezes the stream so you can read; **Clear** empties the list.

## Adding explanations

Open `index.js` and extend the `EXPLAIN` object. Each entry:

```js
ib: {
  name: 'Buy Item',
  desc: 'Buys a clothing/den-store item.',
  out: ['room id', 'shop id', '?', 'item id', '?', '?', '?'],
  in:  ['shop id', 'status (1 = ok)', 'item id', 'gems left', '?']
}
```

- `out` labels the fields on packets **you send**; `in` labels packets the
  **server sends**. Both are optional.
- Labels line up with the fields that come **after** the command token, in order.
- Use `'?'` for anything you haven't figured out yet. Unlabeled fields just
  show as `field N`.

## How it works

It registers one wildcard hook — `dispatch.onMessage({ type: '*', ... })` — which
fires on every packet, and unhooks itself when the window closes. Nothing is
sent anywhere; all explanations come from the local `EXPLAIN` dictionary.
