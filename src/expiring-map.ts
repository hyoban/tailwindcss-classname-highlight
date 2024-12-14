interface ExpiringMap<K, V> {
  get: (key: K) => V | undefined
  set: (key: K, value: V) => void
}

export function expiringMap<K, V>(duration: number): ExpiringMap<K, V> {
  const map = new Map<K, { value: V, expiration: Date }>()

  return {
    get(key: K) {
      const result = map.get(key)
      if (!result)
        return
      if (result.expiration <= new Date()) {
        map.delete(key)
        return
      }

      return result.value
    },

    set(key: K, value: V) {
      const expiration = new Date()
      expiration.setMilliseconds(expiration.getMilliseconds() + duration)

      map.set(key, {
        value,
        expiration,
      })
    },
  }
}
