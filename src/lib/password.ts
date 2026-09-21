import bcrypt from 'bcryptjs';

export async function hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(12);
    const hash = await bcrypt.hash(password, salt);
    return hash;
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plaintext, hash);
}