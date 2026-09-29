# Packet Replay

A manual packet workbench: type or paste a packet, see it explained, send it
once, and save it to a personal library for later.

## Usage

1. Click **Packet Replay** in the plugins sidebar.
2. Paste or type a packet in the **Packet** box (it explains as you type).
3. **Explain** shows what the packet is and breaks down each field.
4. **Send** transmits it to the server **once**. (Paste a saved room-join or
   buy packet, tweak a value, and fire it to test.)
5. Give it a **Name** and hit **Save** to keep it. Saved packets appear below;
   click one to load it back in, or use the ✕ to delete it.

## Where saved packets live

Each saved packet is a JSON file in this plugin's `saved/` folder:

```
plugins/packet-replay/saved/join_jamaa_township.json
```

You can back these up or share individual packet files with others.

## Not a spammer

This is a single-shot tool on purpose: **Send** fires exactly one packet per
click. There's no loop, timer, or auto-repeat. It's meant for testing and
learning the protocol (pairs with the Packet Inspector), not for flooding.

## Adding explanations

The `EXPLAIN` object in `index.js` labels known packet types (same format as
the Packet Inspector). Add entries there to explain more types.
