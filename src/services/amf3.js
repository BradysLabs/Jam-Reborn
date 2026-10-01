/**
 * Minimal AMF3 decoder.
 *
 * Animal Jam's content files (defpacks) are AMF3-encoded. This decodes an
 * AMF3 buffer into plain JavaScript values: objects, arrays, strings,
 * numbers, booleans, dates, and Buffers.
 */
module.exports = class AMF3Decoder {
  /**
   * @param {Buffer} buffer - The AMF3 data.
   */
  constructor (buffer) {
    this.buffer = buffer
    this.offset = 0
    this.strings = []
    this.objects = []
    this.traits = []
  }

  /**
   * Decodes a whole buffer.
   * @param {Buffer} buffer
   * @returns {any}
   */
  static decode (buffer) {
    return new AMF3Decoder(buffer).readValue()
  }

  readByte () {
    if (this.offset >= this.buffer.length) throw new Error('AMF3: unexpected end of data')
    return this.buffer[this.offset++]
  }

  readU29 () {
    let result = 0
    for (let i = 0; i < 4; i++) {
      const byte = this.readByte()
      if (i < 3) {
        result = (result << 7) | (byte & 0x7f)
        if (!(byte & 0x80)) return result
      } else {
        result = (result << 8) | byte
      }
    }
    return result >>> 0
  }

  readInteger () {
    let value = this.readU29()
    if (value & 0x10000000) value -= 0x20000000
    return value
  }

  readDouble () {
    const value = this.buffer.readDoubleBE(this.offset)
    this.offset += 8
    return value
  }

  readUtf8 (length) {
    const value = this.buffer.toString('utf8', this.offset, this.offset + length)
    this.offset += length
    return value
  }

  readString () {
    const ref = this.readU29()
    if ((ref & 1) === 0) return this.strings[ref >> 1]
    const length = ref >> 1
    if (length === 0) return ''
    const value = this.readUtf8(length)
    this.strings.push(value)
    return value
  }

  readValue () {
    const marker = this.readByte()
    switch (marker) {
      case 0x00: return undefined
      case 0x01: return null
      case 0x02: return false
      case 0x03: return true
      case 0x04: return this.readInteger()
      case 0x05: return this.readDouble()
      case 0x06: return this.readString()
      case 0x07: return this.readXml()
      case 0x08: return this.readDate()
      case 0x09: return this.readArray()
      case 0x0A: return this.readObject()
      case 0x0B: return this.readXml()
      case 0x0C: return this.readByteArray()
      case 0x0D: return this.readVector('int')
      case 0x0E: return this.readVector('uint')
      case 0x0F: return this.readVector('double')
      case 0x10: return this.readVector('object')
      case 0x11: return this.readDictionary()
      default: throw new Error(`AMF3: unknown marker 0x${marker.toString(16)}`)
    }
  }

  readXml () {
    const ref = this.readU29()
    if ((ref & 1) === 0) return this.objects[ref >> 1]
    const value = this.readUtf8(ref >> 1)
    this.objects.push(value)
    return value
  }

  readDate () {
    const ref = this.readU29()
    if ((ref & 1) === 0) return this.objects[ref >> 1]
    const value = new Date(this.readDouble())
    this.objects.push(value)
    return value
  }

  readArray () {
    const ref = this.readU29()
    if ((ref & 1) === 0) return this.objects[ref >> 1]
    const denseLength = ref >> 1

    const assoc = {}
    let hasAssoc = false
    const placeholderIndex = this.objects.length
    this.objects.push(null)

    for (let key = this.readString(); key !== ''; key = this.readString()) {
      assoc[key] = this.readValue()
      hasAssoc = true
    }

    if (hasAssoc) {
      this.objects[placeholderIndex] = assoc
      for (let i = 0; i < denseLength; i++) assoc[i] = this.readValue()
      return assoc
    }

    const array = []
    this.objects[placeholderIndex] = array
    for (let i = 0; i < denseLength; i++) array.push(this.readValue())
    return array
  }

  readObject () {
    const ref = this.readU29()
    if ((ref & 1) === 0) return this.objects[ref >> 1]

    let traits
    if ((ref & 2) === 0) {
      traits = this.traits[ref >> 2]
    } else {
      traits = {
        externalizable: (ref & 4) !== 0,
        dynamic: (ref & 8) !== 0,
        sealedCount: ref >> 4,
        className: this.readString(),
        sealed: []
      }
      for (let i = 0; i < traits.sealedCount; i++) traits.sealed.push(this.readString())
      this.traits.push(traits)
    }

    const object = {}
    this.objects.push(object)

    if (traits.externalizable) {
      // ArrayCollection / ObjectProxy wrap a single value.
      if (traits.className === 'flex.messaging.io.ArrayCollection' || traits.className === 'flex.messaging.io.ObjectProxy') {
        const inner = this.readValue()
        this.objects[this.objects.indexOf(object)] = inner
        return inner
      }
      throw new Error(`AMF3: unsupported externalizable class ${traits.className}`)
    }

    for (const name of traits.sealed) object[name] = this.readValue()
    if (traits.dynamic) {
      for (let key = this.readString(); key !== ''; key = this.readString()) {
        object[key] = this.readValue()
      }
    }
    return object
  }

  readByteArray () {
    const ref = this.readU29()
    if ((ref & 1) === 0) return this.objects[ref >> 1]
    const length = ref >> 1
    const value = Buffer.from(this.buffer.subarray(this.offset, this.offset + length))
    this.offset += length
    this.objects.push(value)
    return value
  }

  readVector (kind) {
    const ref = this.readU29()
    if ((ref & 1) === 0) return this.objects[ref >> 1]
    const length = ref >> 1
    this.readByte() // fixed-length flag
    const vector = []
    this.objects.push(vector)
    if (kind === 'object') this.readString() // element type name
    for (let i = 0; i < length; i++) {
      if (kind === 'int') { vector.push(this.buffer.readInt32BE(this.offset)); this.offset += 4 } else if (kind === 'uint') { vector.push(this.buffer.readUInt32BE(this.offset)); this.offset += 4 } else if (kind === 'double') vector.push(this.readDouble())
      else vector.push(this.readValue())
    }
    return vector
  }

  readDictionary () {
    const ref = this.readU29()
    if ((ref & 1) === 0) return this.objects[ref >> 1]
    const length = ref >> 1
    this.readByte() // weak-keys flag
    const dict = new Map()
    this.objects.push(dict)
    for (let i = 0; i < length; i++) {
      const key = this.readValue()
      dict.set(key, this.readValue())
    }
    return dict
  }
}
